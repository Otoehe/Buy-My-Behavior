/* eslint-disable @typescript-eslint/no-explicit-any */
import { BigNumber, ethers } from "ethers";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
];

function parseUnitsCompat(value: string | number, decimals: number) {
  const anyE = ethers as any;
  if (anyE.utils?.parseUnits) return anyE.utils.parseUnits(String(value), decimals); // v5
  return anyE.parseUnits(String(value), decimals); // v6
}

export function toUnits(value: string | number, decimals: number): BigNumber {
  return parseUnitsCompat(value, decimals) as unknown as BigNumber;
}

// ── універсальний ретрай для глючного MetaMask (-32603 / circuit breaker / CALL_EXCEPTION без даних)
function shouldRetry(err: any): boolean {
  const msg = String(err?.message || "");
  const code = (err && (err.code ?? err?.data?.code)) as any;
  const s = msg.toLowerCase();
  return (
    code === -32603 ||
    s.includes("circuit breaker is open") ||
    s.includes("call_exception") ||
    s.includes("missing revert data")
  );
}
async function retry<T>(fn: () => Promise<T>, tries = 4, baseDelay = 350): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (!shouldRetry(e) || i === tries - 1) break;
      await new Promise(r => setTimeout(r, baseDelay * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchTokenDecimals(token: string, provider: any): Promise<number> {
  const erc20 = new (ethers as any).Contract(token, ERC20_ABI, provider);
  const d = await retry(async () => erc20.decimals());
  return Number(d);
}

export async function ensureAllowance(opts: {
  token: string;
  owner: string;
  spender: string;
  amount: BigNumber;
  signer: any;
  approveMax?: boolean;
  waitConfirms?: number;
}): Promise<{ didApprove: boolean; txHash?: string }> {
  const { token, owner, spender, amount, signer, approveMax = false, waitConfirms = 1 } = opts;
  const provider = signer.provider || signer._provider;

  const erc20R = new (ethers as any).Contract(token, ERC20_ABI, provider);
  const current: any = await retry(async () => erc20R.allowance(owner, spender));

  if ((current as any).gte?.(amount) || (typeof current === "bigint" && current >= (amount as any))) {
    return { didApprove: false };
  }

  const erc20W = new (ethers as any).Contract(token, ERC20_ABI, signer);
  const toApprove = approveMax ? ("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as any) : amount;
  const tx = await erc20W.approve(spender, toApprove);
  const rc = await tx.wait(waitConfirms);
  return { didApprove: true, txHash: rc?.transactionHash };
}
