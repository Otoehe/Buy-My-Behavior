/* eslint-disable @typescript-eslint/no-explicit-any */
import { BigNumber, ethers } from "ethers";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

export async function fetchTokenDecimals(token: string, provider: ethers.providers.Provider): Promise<number> {
  const c = new ethers.Contract(token, ERC20_ABI, provider);
  const d: number = await c.decimals();
  return Number(d);
}

export function toUnits(amount: string | number, decimals: number): BigNumber {
  return ethers.utils.parseUnits(String(amount), decimals);
}

export async function ensureAllowance(params: {
  token: string;
  owner: string;
  spender: string;
  amount: BigNumber;
  signer: ethers.Signer;
  approveMax?: boolean;
  waitConfirms?: number;
}): Promise<{ didApprove: boolean; txHash?: string }> {
  const { token, owner, spender, amount, signer, approveMax = false, waitConfirms = 1 } = params;

  const cRO = new ethers.Contract(token, ERC20_ABI, signer.provider!);
  const current: BigNumber = await cRO.allowance(owner, spender);
  if (current.gte(amount)) return { didApprove: false };

  const cRW = new ethers.Contract(token, ERC20_ABI, signer);
  const value = approveMax ? ethers.constants.MaxUint256 : amount;
  const tx = await cRW.approve(spender, value);
  const r = await tx.wait(waitConfirms);
  return { didApprove: true, txHash: r.transactionHash };
}
