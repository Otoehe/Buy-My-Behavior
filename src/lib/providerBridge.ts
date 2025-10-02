/* eslint-disable @typescript-eslint/no-explicit-any */

// Універсальний міст провайдерів.
// Порядок пріоритетів:
// 1) MetaMask in-app браузер → injected provider (без будь-яких реєстрацій/редиректів)
// 2) Desktop з MetaMask → injected provider
// 3) Мобільний поза in-app → MetaMask SDK (deeplink) з shim у window.ethereum
// 4) Fallback → WalletConnect v2 з deeplink у MetaMask

import type { ExternalProvider } from '@ethersproject/providers';

export type Eip1193Request = (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
export type Eip1193Provider = ExternalProvider & {
  request: Eip1193Request;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  providers?: any[];
  isConnected?: () => boolean;
  connect?: () => Promise<void>;
};

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // BSC mainnet
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

const BSC_RPC = (import.meta.env.VITE_BSC_RPC as string) || 'https://bsc-dataseed.binance.org';
const APP_NAME = (import.meta.env.VITE_APP_NAME as string) || 'Buy My Behavior';
const APP_URL  = (import.meta.env.VITE_PUBLIC_APP_URL as string) || (typeof window !== 'undefined' ? window.location.origin : 'https://buymybehavior.com');
const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID as string;

let cached: Eip1193Provider | null = null;
let sdkInstance: any | null = null;

// ───────────────── helpers ─────────────────
const isMobile = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
const isMetaMaskInApp = () => typeof navigator !== 'undefined' && /MetaMaskMobile/i.test(navigator.userAgent || '');

function pickInjected(): Eip1193Provider | null {
  const eth = (globalThis as any).ethereum as Eip1193Provider | undefined;
  if (!eth) return null;
  if (Array.isArray((eth as any).providers) && (eth as any).providers.length) {
    const mm = (eth as any).providers.find((p: any) => p && p.isMetaMask);
    return (mm || (eth as any).providers[0]) as Eip1193Provider;
  }
  return eth ?? null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function pollAccounts(p: Eip1193Provider, totalMs = 25000, step = 500): Promise<string[]> {
  const t0 = Date.now();
  while (Date.now() - t0 < totalMs) {
    try {
      const accs: string[] = await p.request({ method: 'eth_accounts' });
      if (Array.isArray(accs) && accs.length) return accs;
    } catch {}
    await sleep(step);
  }
  return [];
}

async function requestWithConnect(p: Eip1193Provider, method: string, params?: any): Promise<any> {
  try {
    return await p.request({ method, params });
  } catch (err: any) {
    // частий кейс на мобільному: “already processing request” → пробуємо дополучити акаунти
    const msg = String(err?.message || '');
    if (err?.code === -32002 || /already processing|request pending/i.test(msg)) {
      const accs = await pollAccounts(p, 30000, 500);
      if (method === 'eth_requestAccounts' && accs.length) return accs;
    }
    throw err;
  }
}

function setWindowEthereum(p: Eip1193Provider) {
  try { (globalThis as any).ethereum = p; } catch {}
}

async function ensureChainBSC(p: Eip1193Provider) {
  let cid: any;
  try {
    cid = await requestWithConnect(p, 'eth_chainId');
  } catch {}
  const norm = typeof cid === 'number' ? '0x' + cid.toString(16) : String(cid || '').toLowerCase();
  if (norm === CHAIN_ID_HEX.toLowerCase()) return;

  try {
    await requestWithConnect(p, 'wallet_switchEthereumChain', [{ chainId: CHAIN_ID_HEX }]);
  } catch (e: any) {
    if (e?.code === 4902 || /Unrecognized chain|not added/i.test(String(e?.message || ''))) {
      await requestWithConnect(p, 'wallet_addEthereumChain', [{
        chainId: CHAIN_ID_HEX,
        chainName: 'Binance Smart Chain',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        rpcUrls: [BSC_RPC],
        blockExplorerUrls: ['https://bscscan.com'],
      }]);
      await requestWithConnect(p, 'wallet_switchEthereumChain', [{ chainId: CHAIN_ID_HEX }]);
    } else {
      throw e;
    }
  }
}

// ───────────────── MetaMask SDK ─────────────────
async function connectViaMetaMaskSDK(): Promise<Eip1193Provider> {
  const { default: MetaMaskSDK } = await import('@metamask/sdk');

  if (!sdkInstance) {
    sdkInstance = new MetaMaskSDK({
      dappMetadata: { name: APP_NAME, url: APP_URL },
      useDeeplink: true,
      shouldShimWeb3: true,       // <-- важливо: інʼєктує window.ethereum
      checkInstallationImmediately: false,
      logging: { developerMode: false },
      enableAnalytics: false,
      modals: { install: false },
    });
  }

  const provider = sdkInstance.getProvider() as Eip1193Provider;
  setWindowEthereum(provider);

  // тригеримо відкриття MetaMask та сесію
  try { await sdkInstance.connect(); } catch {}

  // добиваємося наявності акаунтів
  try {
    await requestWithConnect(provider, 'eth_requestAccounts');
  } catch {
    const accs = await pollAccounts(provider, 30000, 500);
    if (!accs.length) throw new Error('MetaMask SDK: не отримано акаунтів');
  }

  await ensureChainBSC(provider);

  // підстрахуємо обриви
  provider.on?.('disconnect', () => { cached = null; });
  provider.on?.('chainChanged', () => {});
  provider.on?.('accountsChanged', () => {});

  return provider;
}

// ───────────────── WalletConnect v2 → MetaMask deeplink ─────────────────
// @ts-ignore типи інколи не підтягуються
import EthereumProvider from '@walletconnect/ethereum-provider';

async function connectViaWalletConnect(): Promise<Eip1193Provider> {
  if (!WC_PROJECT_ID) throw new Error('VITE_WC_PROJECT_ID is missing');

  const provider = await EthereumProvider.init({
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
    events: ['display_uri','accountsChanged','chainChanged','disconnect'],
    rpcMap: { [CHAIN_ID_DEC]: BSC_RPC },
    metadata: {
      name: APP_NAME,
      description: 'BMB dapp',
      url: APP_URL,
      icons: [`${APP_URL.replace(/\/$/, '')}/favicon.ico`],
    },
    qrModalOptions: {
      desktopLinks: ['metamask'],
      mobileLinks: ['metamask'],
      preferDesktop: false,
    },
  }) as unknown as Eip1193Provider;

  // Важливо: коли WC дає URI — відкриваємо MetaMask одразу
  (provider as any).on?.('display_uri', (uri: string) => {
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = link; } catch {}
    setTimeout(() => { try { window.open(link, '_blank'); } catch {} }, 350);
  });

  try { await (provider as any).connect(); } catch {}

  setWindowEthereum(provider);

  // дочікуємося акаунтів
  try {
    await requestWithConnect(provider, 'eth_requestAccounts');
  } catch {
    const accs = await pollAccounts(provider, 30000, 500);
    if (!accs.length) throw new Error('WalletConnect: не отримано акаунтів (Return to App?)');
  }

  await ensureChainBSC(provider);

  provider.on?.('disconnect', () => { cached = null; });

  return provider;
}

// ───────────────── Публічне API ─────────────────

export async function connectWallet(): Promise<{ provider: Eip1193Provider; accounts: string[]; chainId: string }> {
  if (cached) {
    const cid: any = await requestWithConnect(cached, 'eth_chainId').catch(() => null);
    return { provider: cached, accounts: (await cached.request({ method: 'eth_accounts' }).catch(() => [])) || [], chainId: typeof cid === 'number' ? '0x' + cid.toString(16) : (cid || CHAIN_ID_HEX) };
  }

  // 1) MetaMask in-app → тільки injected, без жодних SDK/WC і БЕЗ повторної реєстрації
  const injected = pickInjected();
  if (isMetaMaskInApp() && injected) {
    setWindowEthereum(injected);
    try { await requestWithConnect(injected, 'eth_requestAccounts'); } catch {}
    await ensureChainBSC(injected);
    cached = injected;
    const cid: any = await requestWithConnect(injected, 'eth_chainId').catch(() => CHAIN_ID_HEX);
    const accounts: string[] = (await injected.request({ method: 'eth_accounts' }).catch(() => [])) || [];
    return { provider: injected, accounts, chainId: typeof cid === 'number' ? '0x' + cid.toString(16) : (cid || CHAIN_ID_HEX) };
  }

  // 2) Desktop із MetaMask → injected
  if (!isMobile() && injected?.isMetaMask) {
    setWindowEthereum(injected);
    try { await requestWithConnect(injected, 'eth_requestAccounts'); } catch {}
    await ensureChainBSC(injected);
    cached = injected;
    const cid: any = await requestWithConnect(injected, 'eth_chainId').catch(() => CHAIN_ID_HEX);
    const accounts: string[] = (await injected.request({ method: 'eth_accounts' }).catch(() => [])) || [];
    return { provider: injected, accounts, chainId: typeof cid === 'number' ? '0x' + cid.toString(16) : (cid || CHAIN_ID_HEX) };
  }

  // 3) Мобільний зовнішній браузер → MetaMask SDK (deeplink)
  if (isMobile()) {
    try {
      const p = await connectViaMetaMaskSDK();
      cached = p;
      const cid: any = await requestWithConnect(p, 'eth_chainId').catch(() => CHAIN_ID_HEX);
      const accounts: string[] = (await p.request({ method: 'eth_accounts' }).catch(() => [])) || [];
      return { provider: p, accounts, chainId: typeof cid === 'number' ? '0x' + cid.toString(16) : (cid || CHAIN_ID_HEX) };
    } catch {
      // 4) Fallback → WalletConnect
      const p = await connectViaWalletConnect();
      cached = p;
      const cid: any = await requestWithConnect(p, 'eth_chainId').catch(() => CHAIN_ID_HEX);
      const accounts: string[] = (await p.request({ method: 'eth_accounts' }).catch(() => [])) || [];
      return { provider: p, accounts, chainId: typeof cid === 'number' ? '0x' + cid.toString(16) : (cid || CHAIN_ID_HEX) };
    }
  }

  throw new Error('Не знайдено ні MetaMask, ні WalletConnect провайдера.');
}

export async function ensureBSC(provider: Eip1193Provider): Promise<void> {
  await ensureChainBSC(provider);
}
