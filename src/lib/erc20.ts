import { ethers } from 'ethers';

// Binance-Peg USDT on BSC (BEP-20)
export const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955' as const; // 18 decimals

const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
];

export function erc20(address: string, signerOrProvider: any) {
  return new ethers.Contract(address, erc20Abi, signerOrProvider);
}

export async function getTokenDecimals(address: string, provider: any) {
  try { return await erc20(address, provider).decimals(); } catch { return 18; }
}

/**
 * Перевіряє баланс USDT та allowance; якщо allowance < amount — робить approve.
 * Лише для BSC/BEP-20 (USDT_BSC).
 */
export async function ensureAllowanceAndBalance(params: {
  token?: string;   // default: USDT_BSC
  owner: string;    // адреса користувача
  spender: string;  // адреса ескроу
  humanAmount: string; // "1" | "0.3" тощо
  provider: any;    // signer
}) {
  const token = params.token ?? USDT_BSC;
  const c = erc20(token, params.provider);
  const decimals = await getTokenDecimals(token, params.provider);
  const amount = ethers.utils.parseUnits(params.humanAmount, decimals);

  const [bal, allow] = await Promise.all([
    c.balanceOf(params.owner),
    c.allowance(params.owner, params.spender),
  ]);

  if (bal.lt(amount)) {
    const have = ethers.utils.formatUnits(bal, decimals);
    const need = ethers.utils.formatUnits(amount, decimals);
    throw new Error(`Недостатньо USDT (BEP-20): баланс ${have}, потрібно ${need}.`);
  }

  if (allow.lt(amount)) {
    const tx = await c.approve(params.spender, amount);
    await tx.wait();
  }

  return { amount, decimals };
}
