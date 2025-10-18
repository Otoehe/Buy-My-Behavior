/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from 'ethers';

export type Eip1193Provider = {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

declare global {
  interface Window { ethereum?: Eip1193Provider; }
}

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38';
export const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
export const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

export function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}
export function isInsideMetaMaskApp(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return !!window.ethereum?.isMetaMask && (isMobileUA() || /MetaMask/i.test(ua));
}

export function getInjectedProvider(): Eip1193Provider | null {
  return typeof window !== 'undefined' && window.ethereum ? window.ethereum : null;
}

export function ensureProviderOrDeepLink(): Eip1193Provider {
  const provider = getInjectedProvider();
  if (provider) return provider;

  if (isMobileUA()) {
    const link = buildMetaMaskDappLink();
    window.location.href = link;
    const err: any = new Error('Opened MetaMask deeplink; continue inside MetaMask in-app browser.');
    err.code = 'DEEPLINKED';
    throw err;
  }
  const err: any = new Error('Ethereum provider not found. Install MetaMask.');
  err.code = 'NO_PROVIDER';
  throw err;
}

export function buildMetaMaskDappLink(targetUrl?: string): string {
  const url = targetUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
  try {
    const u = new URL(url);
    const hostAndPath = `${u.host}${u.pathname}${u.search}${u.hash}`;
    return `https://metamask.app.link/dapp/${hostAndPath}`;
  } catch {
    if (typeof window !== 'undefined') {
      const u = window.location;
      return `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}${u.hash}`;
    }
    return 'https://metamask.app.link/';
  }
}

export async function connectWallet(): Promise<{
  provider: Eip1193Provider;
  web3: ethers.providers.Web3Provider;
  signer: ethers.Signer;
  address: string;
}> {
  const provider = ensureProviderOrDeepLink();
  const web3 = new ethers.providers.Web3Provider(provider as any, 'any');
  const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
  const signer = web3.getSigner();
  const address = ethers.utils.getAddress(accounts[0]);
  return { provider, web3, signer, address };
}

export async function ensureBSC(provider?: Eip1193Provider): Promise<void> {
  const p = provider ?? ensureProviderOrDeepLink();

  try {
    const chainId = await p.request({ method: 'eth_chainId' });
    if (chainId?.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;
  } catch {}

  try {
    await p.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }],
    });
    return;
  } catch (e: any) {
    if (e?.code !== 4902) throw e; // not added
  }

  await p.request({
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: CHAIN_ID_HEX,
      chainName: 'Binance Smart Chain',
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
      rpcUrls: [
        'https://bsc-dataseed1.bnbchain.org',
        'https://bsc-dataseed.binance.org',
        'https://rpc.ankr.com/bsc',
      ],
      blockExplorerUrls: ['https://bscscan.com'],
    }],
  });
}

export async function waitForReturn(timeoutMs = 120000, pollMs = 700): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') return;
  let resolved = false;
  const done = () => { if (!resolved) { resolved = true; cleanup(); } };
  const onVis = () => { if (document.visibilityState === 'visible') done(); };
  const cleanup = () => { document.removeEventListener('visibilitychange', onVis); };
  document.addEventListener('visibilitychange', onVis);

  const started = Date.now();
  while (!resolved && Date.now() - started < timeoutMs) {
    await new Promise(r => setTimeout(r, pollMs));
    if (document.visibilityState === 'visible') { done(); break; }
  }
  cleanup();
}

export function toBytes32(id: string): string {
  if (/^0x[0-9a-fA-F]{64}$/.test(id)) return id;
  const s = id.length > 31 ? id.slice(0, 31) : id;
  return ethers.utils.formatBytes32String(s);
}
