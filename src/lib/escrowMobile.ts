/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber, ethers } from "ethers";
import { connectWallet, ensureBSC } from "./providerBridge";
import { ensureAllowance, fetchTokenDecimals, toUnits } from "./erc20";

// === ENV ===
export const USDT_ADDRESS = (import.meta as any).env?.VITE_USDT_ADDRESS as string;
export const ESCROW_ADDRESS = (import.meta as any).env?.VITE_ESCROW_ADDRESS as string;

if (!USDT_ADDRESS) console.warn("[BMB] VITE_USDT_ADDRESS is empty");
if (!ESCROW_ADDRESS) console.warn("[BMB] VITE_ESCROW_ADDRESS is empty");

// Мінімальний ABI (ваша сигнатура)
const ESCROW_ABI = [
  "function lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime) payable",
];

/** Якщо input вже bytes32 — лишаємо; інакше → keccak256(utf8) */
function normalizeScenarioId(input: string): string {
  const hex32 = /^0x[0-9a-fA-F]{64}$/;
  if (hex32.test(input)) return input;
  return ethers.utils.id(input);
}

export type LockFundsParams = {
  scenarioId: string;                  // рядок або bytes32
  executor: string;
  referrer?: string | null;
  amount: string | number;             // у людському вигляді
  executionTime: number;               // unix seconds
  onStatus?: (
    status:
      | "connecting"
      | "ensuring_chain"
      | "checking_allowance"
      | "approving"
      | "locking"
      | "done",
    payload?: any
  ) => void;
  waitConfirms?: number;               // 1 за замовчуванням
};

export type LockFundsResult = {
  address: string;                 // адреса платника (замовника)
  approveTxHash?: string;          // хеш approve, якщо був
  lockTxHash: string;              // хеш lockFunds
  lockReceipt: ethers.providers.TransactionReceipt;
  amountUnits: BigNumber;          // сума у найменших одиницях
  decimals: number;                // десятковість USDT
};

export async function lockFundsMobileFlow(params: LockFundsParams): Promise<LockFundsResult> {
  const {
    scenarioId,
    executor,
    referrer,
    amount,
    executionTime,
    onStatus,
    waitConfirms = 1,
  } = params;

  if (!USDT_ADDRESS || !ESCROW_ADDRESS) {
    throw new Error("Missing USDT/ESCROW address in env");
  }

  // 1) Конектимо гаманець
  onStatus?.("connecting");
  const { provider } = await connectWallet();
  if (!provider || typeof (provider as any).request !== "function") {
    throw new Error("MetaMask не під’єднаний. Відкрийте MetaMask і підтвердіть підключення.");
  }
  const ethersProvider = new ethers.providers.Web3Provider(provider as any, "any");
  const signer = ethersProvider.getSigner();
  const address = await signer.getAddress();

  // 2) Гарантуємо BSC
  onStatus?.("ensuring_chain");
  await ensureBSC(provider as any);

  // 3) Переводимо суму у найменші одиниці
  const decimals = await fetchTokenDecimals(USDT_ADDRESS, ethersProvider);
  const amountUnits = toUnits(amount as any, decimals);

  // 4) Забезпечуємо allowance
  onStatus?.("checking_allowance");
  const allowanceRes = await ensureAllowance({
    token: USDT_ADDRESS,
    spender: ESCROW_ADDRESS,
    owner: address,
    amount: amountUnits,
    signer,
    approveMax: false, // тільки рівно потрібну суму
    waitConfirms,
  });

  let approveTxHash: string | undefined;
  if (allowanceRes.didApprove) {
    approveTxHash = allowanceRes.txHash;
    onStatus?.("approving", { txHash: approveTxHash });
  }

  // 5) Власне lockFunds
  onStatus?.("locking");
  const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  const scenarioIdBytes32 = normalizeScenarioId(scenarioId);
  const ref =
    referrer && referrer !== ethers.constants.AddressZero
      ? referrer
      : ethers.constants.AddressZero;

  const tx = await escrow.lockFunds(
    scenarioIdBytes32,
    executor,
    ref,
    amountUnits,
    Math.floor(executionTime),
    { value: 0 }
  );

  const receipt = await tx.wait(waitConfirms);
  onStatus?.("done", { txHash: receipt.transactionHash });

  return {
    address,
    approveTxHash,
    lockTxHash: receipt.transactionHash,
    lockReceipt: receipt,
    amountUnits,
    decimals,
  };
}
