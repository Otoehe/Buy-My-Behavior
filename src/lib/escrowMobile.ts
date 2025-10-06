/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber, ethers } from "ethers";
import {
  connectWallet,
  ensureBSC,
  type Eip1193Provider,
} from "./providerBridge";
import { ensureAllowance, fetchTokenDecimals, toUnits } from "./erc20";

// === ENV ===
export const USDT_ADDRESS = (import.meta as any).env?.VITE_USDT_ADDRESS as string;
export const ESCROW_ADDRESS = (import.meta as any).env?.VITE_ESCROW_ADDRESS as string;

if (!USDT_ADDRESS) console.warn("[BMB] VITE_USDT_ADDRESS is empty");
if (!ESCROW_ADDRESS) console.warn("[BMB] VITE_ESCROW_ADDRESS is empty");

// lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime)
const ESCROW_ABI = [
  "function lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime) payable",
];

function normalizeScenarioId(input: string): string {
  const hex32 = /^0x[0-9a-fA-F]{64}$/;
  if (hex32.test(input)) return input;
  return ethers.utils.id(input); // keccak256(utf8)
}

export type LockFundsParams = {
  scenarioId: string;
  executor: string;
  referrer?: string | null;
  amount: string | number;
  executionTime: number;
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
  waitConfirms?: number;
};

export type LockFundsResult = {
  address: string;
  approveTxHash?: string;
  lockTxHash: string;
  lockReceipt: ethers.providers.TransactionReceipt;
  amountUnits: BigNumber;
  decimals: number;
};

export async function lockFundsMobileFlow(
  params: LockFundsParams
): Promise<LockFundsResult> {
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
  const { provider, signer, address, ethersProvider } = await connectWallet();

  // 2) Мережа
  onStatus?.("ensuring_chain");
  await ensureBSC(provider);

  // 3) amount → units
  const decimals = await fetchTokenDecimals(USDT_ADDRESS, ethersProvider);
  const amountUnits = toUnits(amount as any, decimals);

  // 4) allowance (approve якщо треба)
  onStatus?.("checking_allowance");
  const allowanceRes = await ensureAllowance({
    token: USDT_ADDRESS,
    spender: ESCROW_ADDRESS,
    owner: address,
    amount: amountUnits,
    signer,
    approveMax: false,
    waitConfirms,
  });

  let approveTxHash: string | undefined;
  if (allowanceRes.didApprove) {
    onStatus?.("approving", { txHash: allowanceRes.txHash });
    approveTxHash = allowanceRes.txHash;
  }

  // 5) lockFunds
  const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  const scenarioIdBytes32 = normalizeScenarioId(scenarioId);
  const ref =
    referrer && referrer !== "0x0000000000000000000000000000000000000000"
      ? referrer
      : "0x0000000000000000000000000000000000000000";

  onStatus?.("locking");
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
