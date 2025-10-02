/* eslint-disable @typescript-eslint/no-explicit-any */
// Універсальний міст провайдерів для мобільного/десктопа з надійним очікуванням акаунтів,
// форс-відкриттям dapp у MetaMask Mobile (app-link) та fallback на WalletConnect v2.

import type { ExternalProvider } from '@ethersproject/providers';

export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
} & ExternalProvider;

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38';
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);
const BSC_RPC      = (import.meta.env.VITE_BSC_RPC as string) || 'https://bsc-dataseed.binance.org';
const APP_NAME     = (import.meta.env.VITE_APP_NAME as string) || 'Buy My Behavior';
const APP_URL      = (import.meta.env.VITE_PUBLIC_APP_URL as string) || (typeof window !== 'undefined' ? window.location.origin : 'https://buymybehavior.com');
const WC_PROJECT_ID= import.meta.env.VITE_WC_PROJECT_ID as string;

const IS_MOBILE = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent || '');
const IS_METAMASK_BROWSER = typeof navigator !== 'undefined' && /MetaMaskMobile/i.test(navigator.userAgent || '');

let connectInFlight: Promise<{ provider: Eip1193Provider; accounts: string[]; chainId: string }> | null = null;
let globalMMSDK: any | null = null;

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function log(...args: any[]) { if (import.meta.env.DEV) console.debug('[providerBridge]', ...args); }

function getInjected(): Eip1193Provider | null {
  const eth = (globalThis as any).ethereum as Eip1193Provider | undefined;
  if (!eth) return null;
  if (Array.isArray((eth as any).providers) && (eth as any).providers.length) {
    const mm = (eth as any).providers.find((p: any) => p && p.isMetaMask);
    return (mm || (eth as any).providers[0]) as Eip1193Provider;
  }
  return eth as Eip1193Provider;
}

async function waitForAccounts(eth: Eip1193Provider, timeoutMs = 30000): Promise<string[]> {
  const t0 = Date.now();
  try { await eth.request({ method: 'eth_requestAccounts' }); } catch {}
  while (Date.now() - t0 < timeoutMs) {
    try {
      const accs = await eth.request({ method: 'eth_accounts' });
      if (Array.isArray(accs) && accs.length) return accs as string[];
    } catch {}
    await delay(700);
  }
  throw new Error('Wallet connected but no accounts returned (timeout)');
}

async function openInMetaMaskInApp() {
  // Відкриваємо поточну сторінку усередині браузера MetaMask (універсальний app-link).
  try {
    const href = typeof window !== 'undefined' ? window.location.href : APP_URL;
    const clean = href.replace(/^https?:\/\//i, '');
    const link = `https://metamask.app.link/dapp/${clean}`;
    log('openInMetaMaskInApp', link);
    window.location.href = link;
  } catch (e) { log('openInMetaMaskInApp error', e); }
}

// ───────────────────────────────────── MetaMask SDK ─────────────────────────────────────
async function connectViaMetaMaskSDK(): Promise<{ provider: Eip1193Provider; accounts: string[]; chainId: string }> {
  const { default: MetaMaskSDK } = await import('@metamask/sdk');

  if (!globalMMSDK) {
    globalMMSDK = new MetaMaskSDK({
      dappMetadata: { name: APP_NAME, url: APP_URL },
      useDeeplink: true,              // важливо: app-switch
      shouldShimWeb3: true,           // важливо: інʼєкція window.ethereum
      checkInstallationImmediately: false,
      logging: { developerMode: false },
      enableAnalytics: false,
      storage: localStorage,
    });
  }

  const provider = globalMMSDK.getProvider() as Eip1193Provider;
  // підстрахуємо: гарантовано зробимо window.ethereum видимим
  (globalThis as any).ethereum = provider;

  try { await globalMMSDK.connect(); } catch (e) { log('MMSDK.connect error', e); /* продовжимо — акаунти все одно чекаємо */ }

  // чекаємо акаунти (даємо максимум 8s; далі — відкриваємо dapp всередині MetaMask)
  let accounts: string[] = [];
  try { accounts = await waitForAccounts(provider, 8000); } catch {}

  if (!accounts.length && IS_MOBILE && !IS_METAMASK_BROWSER) {
    // форсимо відкриття у MetaMask Mobile in-app і пробуємо знову
    await openInMetaMaskInApp();
    // користувач повернеться у наш dapp всередині MM — там вже injected провайдер
    // На випадок, якщо повертаємось одразу:
    accounts = await waitForAccounts(provider, 15000);
  }

  let chainId: any = await provider.request({ method: 'eth_chainId' });
  if (typeof chainId === 'number') chainId = '0x' + chainId.toString(16);

  return { provider, accounts, chainId: String(chainId) };
}

// ───────────────────────────────────── WalletConnect v2 ─────────────────────────────────
/* @ts-ignore */
import EthereumProvider from '@walletconnect/ethereum-provider';

async function connectViaWalletConnect(): Promise<{ provider: Eip1193Provider; accounts: string[]; chainId: string }> {
  if (!WC_PROJECT_ID) throw new Error('VITE_WC_PROJECT_ID is missing');

  const provider: Eip1193Provider = await (EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    showQrModal: false,
    chains: [CHAIN_ID_DEC],
    optionalChains: [CHAIN_ID_DEC],
    methods: [
      'eth_chainId','eth_accounts','eth_requestAccounts',
      'wallet_switchEthereumChain','wallet_addEthereumChain',
      'eth_sendTransaction','eth_sign','personal_sign',
      'eth_signTypedData','eth_signTypedData_v4'
    ],
    events: ['accountsChanged','chainChanged','disconnect','session_event','display_uri'],
    rpcMap: { [CHAIN_ID_DEC]: BSC_RPC },
    metadata: {
      name: APP_NAME,
      description: 'BMB dapp',
      url: APP_URL,
      icons: ['https://www.buymybehavior.com/favicon.ico'],
    },
  }) as any);

  // критично: як тільки є wc-uri — відкриваємо MetaMask через deeplink
  (provider as any).on?.('display_uri', (uri: string) => {
    const mmLink = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = mmLink; } catch {}
    // резерв (деякі лаунчери блокують пряму навігацію)
    setTimeout(() => { try { window.open(mmLink, '_blank'); } catch {} }, 400);
  });

  try { await (provider as any).connect(); } catch (e) { log('WC connect error', e); throw e; }

  (globalThis as any).ethereum = provider; // зробимо WC базовим провайдером

  const accounts = await waitForAccounts(provider, 20000);
  let chainId: any = await provider.request({ method: 'eth_chainId' });
  if (typeof chainId === 'number') chainId = '0x' + chainId.toString(16);

  return { provider, accounts, chainId: String(chainId) };
}

// ───────────────────────────────────── Injected (desktop/MM browser) ────────────────────
async function connectInjectedOnce(): Promise<{ provider: Eip1193Provider; accounts: string[]; chainId: string }> {
  const provider = getInjected();
  if (!provider) throw new Error('NO_INJECTED_PROVIDER');
  (globalThis as any).ethereum = provider;

  try { await provider.request({ method: 'eth_requestAccounts' }); } catch {}
  const accounts = await waitForAccounts(provider, 8000);
  let chainId: any = await provider.request({ method: 'eth_chainId' });
  if (typeof chainId === 'number') chainId = '0x' + chainId.toString(16);

  return { provider, accounts, chainId: String(chainId) };
}

// ───────────────────────────────────── Публічне API ─────────────────────────────────────
export async function connectWallet(): Promise<{ provider: Eip1193Provider }> {
  if (!connectInFlight) {
    connectInFlight = (async () => {
      // 1) Якщо ми вже в MetaMask Browser — просто injected
      if (IS_METAMASK_BROWSER) {
        log('Using injected (MetaMask Browser)');
        return await connectInjectedOnce();
      }

      // 2) Desktop зі встановленим MetaMask — injected
      const injected = getInjected();
      if (injected && !IS_MOBILE) {
        log('Using injected (desktop)');
        return await connectInjectedOnce();
      }

      // 3) Mobile: спочатку MetaMask SDK (deeplink + shim web3)
      if (IS_MOBILE) {
        try {
          log('Trying MetaMask SDK...');
          const r = await connectViaMetaMaskSDK();
          log('MMSDK connected');
          return r;
        } catch (e) {
          log('MMSDK failed, fallback WC2...', e);
          // 4) Fallback: WalletConnect v2 з прямим deeplink у MetaMask
          const r = await connectViaWalletConnect();
          log('WC2 connected');
          return r;
        }
      }

      throw new Error('NO_WALLET_AVAILABLE');
    })().finally(() => setTimeout(() => { connectInFlight = null; }, 400));
  }

  const res = await connectInFlight;
  return { provider: res.provider };
}

export async function ensureBSC(provider: Eip1193Provider): Promise<void> {
  let cid: any = null;
  try { cid = await provider.request({ method: 'eth_chainId' }); } catch {}
  const hex = typeof cid === 'number' ? '0x' + cid.toString(16) : String(cid || '').toLowerCase();
  if (hex === CHAIN_ID_HEX.toLowerCase()) return;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (err?.code === 4902 || /Unrecognized chain|not added/i.test(msg)) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: [BSC_RPC],
          blockExplorerUrls: ['https://bscscan.com'],
        }] as any,
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
      return;
    }
    throw err;
  }
}
