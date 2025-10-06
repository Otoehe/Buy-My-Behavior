/* eslint-disable @typescript-eslint/no-explicit-any */
import { BigNumber, ethers } from "ethers";
import { connectWallet, ensureBSC } from "./providerBridge";
import { ensureAllowance, fetchTokenDecimals, toUnits } from "./erc20";

// === ENV ===
export const USDT_ADDRESS   = (import.meta as any).env?.VITE_USDT_ADDRESS as string;
export const ESCROW_ADDRESS = (import.meta as any).env?.VITE_ESCROW_ADDRESS as string;

if (!USDT_ADDRESS)  console.warn("[BMB] VITE_USDT_ADDRESS is empty");
if (!ESCROW_ADDRESS) console.warn("[BMB] VITE_ESCROW_ADDRESS is empty");

// Escrow ABI: lockFunds(bytes32,address,address,uint256,uint256)
const ESCROW_ABI = [
  "function lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime) payable",
];

function keccakString(s: string): string {
  const anyE = ethers as any;
  try {
    if (anyE.utils?.id) return anyE.utils.id(s); // v5
    if (anyE.id) return anyE.id(s);              // v6
  } catch {}
  // дуже рідко, але на крайній випадок:
  return ("0x" + Buffer.from(s, "utf8").toString("hex")).slice(0, 66).padEnd(66, "0");
}

/** Нормалізація scenarioId до bytes32 */
function normalizeScenarioId(input: string): string {
  const hex32 = /^0x[0-9a-fA-F]{64}$/;
  if (hex32.test(input)) return input;
  return keccakString(input);
}

export type LockFundsParams = {
  scenarioId: string;
  executor: string;
  referrer?: string | null;
  amount: string | number;
  executionTime: number;
  onStatus?: (
    status: "connecting" | "ensuring_chain" | "checking_allowance" | "approving" | "locking" | "done",
    payload?: any
  ) => void;
  waitConfirms?: number;
};

export type LockFundsResult = {
  address: string;
  approveTxHash?: string;
  lockTxHash: string;
  lockReceipt: any;
  amountUnits: BigNumber;
  decimals: number;
};

export async function lockFundsMobileFlow(params: LockFundsParams): Promise<LockFundsResult> {
  const { scenarioId, executor, referrer, amount, executionTime, onStatus, waitConfirms = 1 } = params;

  if (!USDT_ADDRESS || !ESCROW_ADDRESS) {
    throw new Error("Missing USDT/ESCROW address in env");
  }

  onStatus?.("connecting");
  const { signer, address, ethersProvider } = await connectWallet();

  onStatus?.("ensuring_chain");
  await ensureBSC(); // використовує активний провайдер

  const decimals = await fetchTokenDecimals(USDT_ADDRESS, ethersProvider);
  const amountUnits = toUnits(amount as any, decimals);

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

  let approveTxHash: string | undefined = undefined;
  if (allowanceRes.didApprove) {
    approveTxHash = allowanceRes.txHash;
    onStatus?.("approving", { txHash: approveTxHash });
  }

  const escrow = new (ethers as any).Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  const scenarioIdBytes32 = normalizeScenarioId(scenarioId);
  const ref = (referrer && referrer !== "0x0000000000000000000000000000000000000000")
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
