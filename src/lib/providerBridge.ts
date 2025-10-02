/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExternalProvider } from '@ethersproject/providers';

export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
} & ExternalProvider;

// ───────────────── Env & platform ─────────────────
const IS_BROWSER = typeof window !== 'undefined';
const IS_MOBILE =
  IS_BROWSER && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // BSC mainnet
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID as string;

let _cachedProvider: Eip1193Provider | null = null;

// ───────────────── MetaMask SDK (dynamic import) ─────────────────
let _sdk: any | null = null;

async function connectMetaMaskSDK(): Promise<Eip1193Provider> {
  // dynamic import → SSR safe
  const mod = await import('@metamask/sdk');
  const MetaMaskSDK = mod.default;

  if (!_sdk) {
    _sdk = new MetaMaskSDK({
      injectProvider: true,
      useDeeplink: true,
      preferDesktop: false,
      communicationLayerPreference: 'webrtc',
      checkInstallationImmediately: false,
      dappMetadata: {
        name: 'Buy My Behavior',
        url: IS_BROWSER ? window.location.origin : 'https://www.buymybehavior.com',
      },
      modals: { install: false },
      logging: { developerMode: false },
      storage: IS_BROWSER ? localStorage : undefined,
    });
    _sdk.getProvider();
  }

  const eth = (IS_BROWSER ? (window as any).ethereum : undefined) as Eip1193Provider | undefined;
  if (!eth) throw new Error('MetaMask provider не інʼєктувався');

  // open/connect — якщо користувач відмінив, все одно могли відправити deeplink
  try { await _sdk.connect(); } catch {}

  // accounts
  try {
    await eth.request({ method: 'eth_requestAccounts' });
  } catch {
    try {
      await eth.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] as any });
    } catch {}
    await eth.request({ method: 'eth_accounts' });
  }

  // network
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
  } catch (err: any) {
    if (err?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com'],
        }] as any,
      });
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
    } else {
      throw err;
    }
  }

  return eth;
}

// ───────────────── WalletConnect (dynamic import) ─────────────────
async function createWCProvider(): Promise<any> {
  // dynamic import → SSR safe
  const mod = await import('@walletconnect/ethereum-provider');
  const EthereumProvider = mod.default;

  const provider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    showQrModal: false,
    chains: [CHAIN_ID_DEC],
    optionalChains: [CHAIN_ID_DEC],
    methods: [
      'eth_sendTransaction',
      'personal_sign',
      'eth_signTypedData',
      'eth_sign',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
      'eth_requestAccounts',
    ],
    events: ['chainChanged', 'accountsChanged', 'disconnect', 'session_event'],
    rpcMap: { [CHAIN_ID_DEC]: 'https://bsc-dataseed.binance.org/' },
    metadata: {
      name: 'Buy My Behavior',
      description: 'Web3 escrow',
      url: IS_BROWSER ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/icon.png'],
    },
  });

  return provider;
}

/**
 * ВАЖЛИВО: викликати В САМЕЙ onClick без awaited дій ДО нього.
 * Стратегія “URI-only”: чекаємо display_uri і відкриваємо universal link.
 * Без миттєвого `metamask://` → менше шансів на “білий екран”.
 */
export function primeMobileWalletDeeplink(intent: 'lock' | 'approve' | 'confirm' = 'lock') {
  if (!IS_BROWSER || !IS_MOBILE) return;

  // стартуємо асинхронно, але виклик цієї функції має бути в user-gesture.
  (async () => {
    if (!WC_PROJECT_ID) return;

    try {
      const provider: Eip1193Provider = await createWCProvider();

      provider.on?.('display_uri', (uri: string) => {
        const uni = `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;

        // створюємо прихований <a>, клікаємо одразу (ще в контексті користувацького кліку)
        const a = document.createElement('a');
        a.href = uni;
        a.rel = 'noreferrer noopener';
        a.target = '_self';
        a.style.display = 'none';
        document.body.appendChild(a);
        try { a.click(); } catch {}
        setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 1000);
      });

      // не блокуємо клік — connect у фоні
      (provider as any).connect().catch(() => {});
      (window as any).ethereum = provider;
      _cachedProvider = provider;
    } catch {
      // якщо WC зірвався — нічого, далі connectWallet() підбере SDK або інший шлях
    }
  })();
}

async function connectWalletConnect(): Promise<Eip1193Provider> {
  if (!WC_PROJECT_ID) throw new Error('VITE_WC_PROJECT_ID не заданий у середовищі!');

  const provider: Eip1193Provider = await createWCProvider();

  provider.on?.('display_uri', (uri: string) => {
    const uni = `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;
    const a = document.createElement('a');
    a.href = uni;
    a.rel = 'noreferrer noopener';
    a.target = '_self';
    a.style.display = 'none';
    document.body.appendChild(a);
    try { a.click(); } catch {}
    setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 1000);
  });

  try { await (provider as any).connect(); } catch (e) { throw e; }

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com'],
        }] as any,
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
    }
  }

  return provider;
}

// ───────────────── Публічне API ─────────────────
export async function connectWallet(): Promise<{ provider: Eip1193Provider }> {
  if (_cachedProvider) return { provider: _cachedProvider };

  // Desktop із інʼєктованим MM
  if (IS_BROWSER && !IS_MOBILE && (window as any).ethereum?.isMetaMask) {
    _cachedProvider = (window as any).ethereum;
    return { provider: _cachedProvider };
  }

  if (IS_MOBILE) {
    // спершу SDK (мінімум переходів), якщо не вийшло — WC
    try {
      _cachedProvider = await connectMetaMaskSDK();
      return { provider: _cachedProvider };
    } catch {
      _cachedProvider = await connectWalletConnect();
      return { provider: _cachedProvider };
    }
  }

  throw new Error('Не знайдено ні MetaMask, ні WalletConnect провайдера.');
}

export async function ensureBSC(provider: Eip1193Provider): Promise<void> {
  try {
    const cid = await provider.request({ method: 'eth_chainId' });
    if (String(cid).toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;
  } catch {}
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com'],
        }] as any,
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
    } else {
      throw err;
    }
  }
}
