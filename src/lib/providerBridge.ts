/* eslint-disable @typescript-eslint/no-explicit-any */
import EthereumProvider from '@walletconnect/ethereum-provider';
import { ethers } from 'ethers';

export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (event: string, cb: (...a: any[]) => void) => void;
  removeListener?: (event: string, cb: (...a: any[]) => void) => void;
  disconnect?: () => Promise<void>;
  connected?: boolean;
  session?: any;
  isWalletConnect?: boolean;
  isMetaMask?: boolean;
};

export const CHAIN_ID_DEC = Number(import.meta.env.VITE_BSC_CHAIN_ID ?? 56);
export const CHAIN_ID_HEX = '0x' + CHAIN_ID_DEC.toString(16);
const RPC_URL = (import.meta.env.VITE_BSC_RPC_URL as string) ?? 'https://bsc-dataseed1.binance.org';
const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string;

/* ───────────────────────── helpers ───────────────────────── */

function pickInjectedMetaMask(): Eip1193Provider | null {
  const eth: any = (window as any).ethereum;
  if (!eth) return null;
  if (eth.isMetaMask) return eth as Eip1193Provider;
  if (Array.isArray(eth?.providers)) {
    const mm = eth.providers.find((p: any) => p.isMetaMask);
    if (mm) {
      (window as any).ethereum = mm;
      return mm as Eip1193Provider;
    }
  }
  return eth as Eip1193Provider;
}

function isMetaMaskInApp(): boolean {
  // В in-app браузері в UA є "MetaMaskMobile"
  return /MetaMaskMobile/i.test(navigator.userAgent || '') || !!pickInjectedMetaMask()?.isMetaMask;
}

async function getChainId(p: Eip1193Provider): Promise<number> {
  try {
    const hex = await p.request({ method: 'eth_chainId' });
    return typeof hex === 'string' ? parseInt(hex, 16) : Number(hex);
  } catch {
    return -1;
  }
}

async function accountsOf(p: Eip1193Provider): Promise<string[]> {
  try {
    const a = await p.request({ method: 'eth_accounts' });
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

/* ──────────────────────── singletons ─────────────────────── */

const cache = {
  provider: null as Eip1193Provider | null,
  kind: null as null | 'inpage' | 'wc',
  connecting: false,
  deepLinkedOnce: false,
};

function setCached(p: Eip1193Provider, kind: 'inpage' | 'wc') {
  cache.provider = p;
  cache.kind = kind;
}

async function ensureWcProvider(): Promise<Eip1193Provider> {
  // уже створений і активний
  if (cache.provider && cache.kind === 'wc') return cache.provider!;
  const wc = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    chains: [CHAIN_ID_DEC],
    optionalChains: [CHAIN_ID_DEC],
    showQrModal: false, // ми відкриваємо deeplink самі
    rpcMap: { [CHAIN_ID_DEC]: RPC_URL },
    methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign', 'eth_requestAccounts', 'wallet_switchEthereumChain', 'wallet_addEthereumChain'],
    events: ['chainChanged', 'accountsChanged', 'disconnect', 'connect'],
    metadata: {
      name: 'Buy My Behavior',
      description: 'Escrow DApp',
      url: location.origin,
      icons: ['https://www.buymybehavior.com/icon.png'],
    },
  });

  wc.on('display_uri', (uri: string) => {
    // відкриваємо deeplink лише один раз на перший connect
    if (cache.deepLinkedOnce) return;
    cache.deepLinkedOnce = true;
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try {
      // На Android саме заміна location найстабільніша
      window.location.href = link;
    } catch {
      // як fallback
      window.open(link, '_self');
    }
  });

  wc.on('disconnect', () => {
    cache.provider = null;
    cache.kind = null;
    cache.deepLinkedOnce = false;
  });

  setCached(wc as unknown as Eip1193Provider, 'wc');
  return cache.provider!;
}

/* ───────────────────────── public API ───────────────────────── */

/**
 * Підключення гаманця по кліку користувача.
 * - В in-app MetaMask: використовуємо інжектований provider, НІЯКОГО WalletConnect.
 * - В звичайному браузері: ініціюємо/реюзаємо один WalletConnect сеанс, deeplink лиш один раз.
 */
export async function connectWallet(): Promise<{ provider: Eip1193Provider; accounts: string[] }> {
  if (cache.connecting) {
    // зачекаємо доки попередній connect завершиться
    await new Promise(r => setTimeout(r, 250));
    if (cache.provider) return { provider: cache.provider, accounts: await accountsOf(cache.provider) };
  }

  // Якщо вже є активний провайдер — просто повертаємо його.
  if (cache.provider) {
    const accs = await accountsOf(cache.provider);
    if (accs.length > 0) return { provider: cache.provider, accounts: accs };
  }

  cache.connecting = true;
  try {
    if (isMetaMaskInApp()) {
      const mm = pickInjectedMetaMask();
      if (!mm) throw new Error('MetaMask provider not found');
      const accounts = await mm.request({ method: 'eth_requestAccounts' });
      setCached(mm, 'inpage');
      return { provider: mm, accounts };
    }

    const wc = await ensureWcProvider();
    // Якщо вже є сесія — не ініціюємо нову
    const already = (wc as any).session?.topic && ((wc as any).connected ?? true);
    if (!already) {
      await (wc as any).connect({ chains: [CHAIN_ID_DEC] });
    }
    const accounts = await wc.request({ method: 'eth_accounts' });
    return { provider: wc, accounts };
  } finally {
    cache.connecting = false;
  }
}

/** Перемикає на BSC лише якщо ми не там. Якщо мережі ще нема — додає. */
export async function ensureBSC(provider?: Eip1193Provider) {
  const p = provider ?? cache.provider ?? pickInjectedMetaMask();
  if (!p) throw new Error('Wallet provider is not available');

  const current = await getChainId(p);
  if (current === CHAIN_ID_DEC) return;

  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
  } catch (e: any) {
    // 4902 — мережа не додана
    if (String(e?.code) === '4902' || /Unrecognized chain ID/i.test(e?.message || '')) {
      await p.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: 'BNB Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: ['https://bscscan.com'],
        }] as any,
      });
    } else {
      throw e;
    }
  }
}

/** Корисно для дебагу/відображення статусу в UI */
export async function isWalletConnected(): Promise<boolean> {
  if (!cache.provider) return false;
  const accs = await accountsOf(cache.provider);
  return accs.length > 0;
}
