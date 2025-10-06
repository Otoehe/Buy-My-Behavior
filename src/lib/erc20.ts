/* eslint-disable @typescript-eslint/no-explicit-any */
import { BigNumber, ethers } from 'ethers';

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
];

export async function fetchTokenDecimals(token: string, provider: ethers.providers.Provider): Promise<number> {
  const c = new ethers.Contract(token, ERC20_ABI, provider);
  return await c.decimals();
}

export function toUnits(amount: string | number, decimals: number): BigNumber {
  return ethers.utils.parseUnits(String(amount), decimals);
}

export async function ensureAllowance(args: {
  token: string;
  owner: string;
  spender: string;
  amount: BigNumber;
  signer: ethers.Signer;
  approveMax?: boolean;
  waitConfirms?: number;
}): Promise<{ didApprove: boolean; txHash?: string }> {
  const { token, owner, spender, amount, signer, approveMax = false, waitConfirms = 1 } = args;
  const provider = signer.provider!;
  const c = new ethers.Contract(token, ERC20_ABI, provider);
  const cur: BigNumber = await c.allowance(owner, spender);
  if (cur.gte(amount)) return { didApprove: false };

  const withSigner = c.connect(signer);
  const toApprove = approveMax ? ethers.constants.MaxUint256 : amount;
  const tx = await withSigner.approve(spender, toApprove);
  const rc = await tx.wait(waitConfirms);
  return { didApprove: true, txHash: rc.transactionHash };
}
