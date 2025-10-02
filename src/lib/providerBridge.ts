/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExternalProvider } from '@ethersproject/providers';

export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
} & ExternalProvider;

const IS_MOBILE =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38';
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : '0x' + Number(RAW_CHAIN_ID).toString(16);
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID as string;

let _cachedProvider: Eip1193Provider | null = null;

// ───────────────── MetaMask SDK ─────────────────
let _sdk: any | null = null;
async function connectMetaMaskSDK(): Promise<Eip1193Provider> {
  const { default: MetaMaskSDK } = await import('@metamask/sdk');

  if (!_sdk) {
    _sdk = new MetaMaskSDK({
      injectProvider: true,
      useDeeplink: true,
      preferDesktop: false,
      communicationLayerPreference: 'webrtc',
      checkInstallationImmediately: false,
      dappMetadata: {
        name: 'Buy My Behavior',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      },
      modals: { install: false },
      logging: { developerMode: false },
      storage: localStorage,
    });
    _sdk.getProvider();
  }

  const eth = (window as any).ethereum as Eip1193Provider | undefined;
  if (!eth) throw new Error('MetaMask provider не інʼєктувався');

  await _sdk.connect().catch(() => { /* ігноруємо — deeplink все одно пішов */ });

  // access
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

// ───────────────── WalletConnect v2 ─────────────────
// @ts-ignore
import EthereumProvider from '@walletconnect/ethereum-provider';

let __wcConnecting = false;
let __deeplinkPrimedAt = 0;

/**
 * ВАЖЛИВО: Викликаємо в onClick БЕЗ `await` перед цим!
 * Миттєво відкриває MetaMask (metamask://), паралельно стартує WC.
 * Коли приходить display_uri — добиває універсальним лінком, який відкриє сесію.
 */
export function primeMobileWalletDeeplink(intent: 'lock' | 'approve' | 'confirm' = 'lock') {
  if (!IS_MOBILE) return;

  // 0) миттєвий "поштовх" — відкриє MetaMask (якщо дозволено ОС)
  try {
    // просто відкрити додаток; далі підʼєднаємося WC/SDK
    window.location.href = 'metamask://';
    __deeplinkPrimedAt = Date.now();
  } catch {}

  // 1) якщо вже створюємо WC — не дублюємо
  if (__wcConnecting) return;
  __wcConnecting = true;

  (async () => {
    try {
      if (!WC_PROJECT_ID) throw new Error('VITE_WC_PROJECT_ID не заданий');
      const provider: Eip1193Provider = (await EthereumProvider.init({
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
          url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
          icons: ['https://www.buymybehavior.com/icon.png'],
        },
      })) as any;

      // 2) як тільки зʼявився wc URI — відкриваємо універсальний лінк MM
      provider.on?.('display_uri', (uri: string) => {
        const uni = `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;
        // віддати MM точний запит (вже знаходячись у фокусі або ще у браузері)
        try { window.location.href = uni; } catch {}
        // підстраховка
        setTimeout(() => { try { window.location.href = uni; } catch {} }, 300);
      });

      // 3) старт сесії (без await — не блокуємо клік)
      (provider as any).connect().catch(() => {});

      // 4) кеш як глобальний ethereum (зручно для web3)
      (window as any).ethereum = provider;
      _cachedProvider = provider;
    } catch (e) {
      // fallback: при наступній спробі підемо через SDK
    } finally {
      // через секунду дозволимо перезапуск, якщо треба
      setTimeout(() => { __wcConnecting = false; }, 1000);
    }
  })();
}

async function connectWalletConnect(): Promise<Eip1193Provider> {
  if (!WC_PROJECT_ID) throw new Error('VITE_WC_PROJECT_ID не заданий у середовищі!');

  const provider: Eip1193Provider = (await EthereumProvider.init({
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
      url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/icon.png'],
    },
  })) as any;

  provider.on?.('display_uri', (uri: string) => {
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = link; } catch {}
    setTimeout(() => {
      try { window.location.href = `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`; } catch {}
    }, 250);
  });

  try { await (provider as any).connect(); } catch (e) { throw e; }

  // мережа
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

  // Desktop з інʼєктованим MM
  if (!IS_MOBILE && (window as any).ethereum?.isMetaMask) {
    _cachedProvider = (window as any).ethereum;
    return { provider: _cachedProvider };
  }

  if (IS_MOBILE) {
    // якщо wc ще не вистрілив — можна підхопити SDK
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
