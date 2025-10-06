/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber, ethers } from "ethers";
import { connectWallet, ensureBSC, waitForReturn, type Eip1193Provider } from "./providerBridge";
import { ensureAllowance, fetchTokenDecimals, toUnits } from "./erc20";

export const USDT_ADDRESS   = (import.meta as any).env?.VITE_USDT_ADDRESS as string;
export const ESCROW_ADDRESS = (import.meta as any).env?.VITE_ESCROW_ADDRESS as string;

if (!USDT_ADDRESS)  console.warn("[BMB] VITE_USDT_ADDRESS is empty");
if (!ESCROW_ADDRESS) console.warn("[BMB] VITE_ESCROW_ADDRESS is empty");

const ESCROW_ABI = [
  "function lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime) payable",
];

function normalizeScenarioId(input: string): string {
  const hex32 = /^0x[0-9a-fA-F]{64}$/;
  if (hex32.test(input)) return input;
  return ethers.utils.id(input);
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

async function pokeProvider(p: Eip1193Provider) {
  try { await p.request({ method: "eth_chainId" }); } catch {}
  try { await p.request({ method: "eth_accounts" }); } catch {}
}

async function waitWalletForeground(p: Eip1193Provider, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { await p.request({ method: "eth_chainId" }); return; }
    catch (e: any) {
      const msg = String(e?.message || "");
      if (e?.code === -32002 || /already pending/i.test(msg)) {
        await waitForReturn(600);
      } else {
        await waitForReturn(350);
      }
    }
  }
}

export async function lockFundsMobileFlow(params: LockFundsParams): Promise<LockFundsResult> {
  const {
    scenarioId, executor, referrer, amount, executionTime, onStatus, waitConfirms = 1,
  } = params;

  if (!USDT_ADDRESS || !ESCROW_ADDRESS) {
    throw new Error("Missing USDT/ESCROW address in env");
  }

  onStatus?.("connecting");
  const { provider } = await connectWallet();
  if (!provider || typeof (provider as any).request !== "function") {
    throw new Error("Wallet provider is not ready. Open MetaMask and try again.");
  }

  const ethersProvider = new ethers.providers.Web3Provider(provider as any);
  const signer = ethersProvider.getSigner();
  const address = await signer.getAddress();

  onStatus?.("ensuring_chain");
  await ensureBSC(provider);

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

  let approveTxHash: string | undefined;
  if (allowanceRes.didApprove) {
    approveTxHash = allowanceRes.txHash;
    onStatus?.("approving", { txHash: approveTxHash });

    await waitForReturn(1200);
    await pokeProvider(provider);
    await waitWalletForeground(provider, 12000);
  }

  const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  const scenarioIdBytes32 = normalizeScenarioId(scenarioId);
  const ref = referrer && referrer !== "0x0000000000000000000000000000000000000000"
    ? referrer
    : "0x0000000000000000000000000000000000000000";

  onStatus?.("locking");
  let tx;
  try {
    tx = await escrow.lockFunds(
      scenarioIdBytes32,
      executor,
      ref,
      amountUnits,
      Math.floor(executionTime),
      { value: 0 }
    );
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (e?.code === -32002 || /already pending|request.*pending/i.test(msg)) {
      await waitForReturn(1500);
      await waitWalletForeground(provider, 12000);
      tx = await escrow.lockFunds(
        scenarioIdBytes32,
        executor,
        ref,
        amountUnits,
        Math.floor(executionTime),
        { value: 0 }
      );
    } else {
      throw e;
    }
  }

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
