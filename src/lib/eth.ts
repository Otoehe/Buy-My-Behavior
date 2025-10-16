// src/lib/eth.ts
/* Мінімальні утиліти для MetaMask без сторонніх бібліотек */

declare global {
  interface Window {
    ethereum?: any;
  }
}

export type Hex = `0x${string}`;

export const CHAIN_PRESETS: Record<string, {
  chainId: Hex;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorerUrls?: string[];
}> = {
  bsc: {
    chainId: '0x38', // 56
    chainName: 'BNB Smart Chain Mainnet',
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    blockExplorerUrls: ['https://bscscan.com'],
  },
  bsctest: {
    chainId: '0x61', // 97
    chainName: 'BNB Smart Chain Testnet',
    rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
    nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
    blockExplorerUrls: ['https://testnet.bscscan.com'],
  },
};

export function toHexWei(v: bigint): Hex {
  return ('0x' + v.toString(16)) as Hex;
}

export function parseUnits(amount: string, decimals = 18): bigint {
  // безпечний аналог ethers.parseUnits
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error('Bad amount');
  const [ints, fr = ''] = amount.split('.');
  const frac = (fr + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(ints) * BigInt(10) ** BigInt(decimals) + BigInt(frac || '0');
}

export function normalizeChainId(input?: string): Hex | null {
  if (!input) return null;
  if (input.startsWith('0x')) return input as Hex;
  const n = BigInt(input);
  return ('0x' + n.toString(16)) as Hex;
}

export async function ensureChain(chainId: Hex): Promise<void> {
  if (!window.ethereum) throw new Error('MetaMask provider not found');
  try {
    const current = await window.ethereum.request({ method: 'eth_chainId' });
    if (typeof current === 'string' && current.toLowerCase() === chainId.toLowerCase()) return;

    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });
  } catch (e: any) {
    // 4902 — мережа не додана
    if (e?.code === 4902) {
      const preset = Object.values(CHAIN_PRESETS).find(p => p.chainId.toLowerCase() === chainId.toLowerCase());
      if (!preset) throw e;
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [preset],
      });
    } else {
      throw e;
    }
  }
}

export async function requestAccount(): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask provider not found');
  const [acc] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!acc) throw new Error('No accounts');
  return acc.toLowerCase();
}

// ERC20 approve(address spender, uint256 amount)
export function buildApproveData(spender: string, amountWei: bigint): Hex {
  const selector = '095ea7b3'; // keccak256('approve(address,uint256)')[0..3] * 4
  const addr = spender.toLowerCase().replace(/^0x/, '');
  if (addr.length !== 40) throw new Error('Bad spender address');
  const amount = amountWei.toString(16).padStart(64, '0');
  const paddedAddr = addr.padStart(64, '0');
  return ('0x' + selector + paddedAddr + amount) as Hex;
}

export async function sendTx(tx: {
  from: string; to: string; data?: Hex; value?: Hex;
}): Promise<string> {
  const hash = await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [tx],
  });
  return hash as string;
}

export async function waitForReceipt(hash: string, timeoutMs = 120_000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const r = await window.ethereum.request({
      method: 'eth_getTransactionReceipt',
      params: [hash],
    });
    if (r && r.blockNumber) return r;
    await new Promise(res => setTimeout(res, 1500));
  }
  throw new Error('Tx confirmation timeout');
}
