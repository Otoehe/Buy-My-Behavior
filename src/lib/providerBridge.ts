/* eslint-disable @typescript-eslint/no-explicit-any */

// Універсальний міст провайдерів для мобільного браузера (НЕ in-app браузер MM).
// Стратегія: MetaMask SDK (deeplink) → fallback WalletConnect v2 (deeplink на MM).
// Повертає стабільний EIP-1193 провайдер для всіх on-chain дій.

import type { ExternalProvider } from '@ethersproject/providers';

export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
} & ExternalProvider;

const IS_MOBILE =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // BSC mainnet
export const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x')
  ? RAW_CHAIN_ID
  : ('0x' + Number(RAW_CHAIN_ID).toString(16));
export const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

// WalletConnect ProjectId (must)
const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID as string;

let _cachedProvider: Eip1193Provider | null = null;

// ─────────────── MetaMask SDK ───────────────
let _sdk: any | null = null;

async function connectMetaMaskSDK(): Promise<Eip1193Provider> {
  const { default: MetaMaskSDK } = await import('@metamask/sdk');

  if (!_sdk) {
    _sdk = new MetaMaskSDK({
      injectProvider: true,
      useDeeplink: true, // критично для мобільних — повертаємось у браузер
      preferDesktop: false,
      communicationLayerPreference: 'webrtc',
      checkInstallationImmediately: false,
      dappMetadata: {
        name: 'Buy My Behavior',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      },
      modals: { install: false },
      logging: { developerMode: false },
      storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    });

    // створюємо інʼєкцію
    _sdk.getProvider();
  }

  const eth = (window as any).ethereum as Eip1193Provider | undefined;
  if (!eth) throw new Error('MetaMask provider не інʼєктувався');

  // конект до гаманця (через deeplink у додаток MM і назад у браузер)
  await _sdk.connect();

  // доступ до акаунтів (на iOS інколи потрібні повтори)
  try {
    await eth.request({ method: 'eth_requestAccounts' });
  } catch {
    try {
      await eth.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }] as any,
      });
    } catch {}
    await eth.request({ method: 'eth_accounts' });
  }

  // перемикання мережі
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }] as any,
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: 'Binance Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: ['https://bsc-dataseed.binance.org/'],
            blockExplorerUrls: ['https://bscscan.com'],
          },
        ] as any,
      });
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX }] as any,
      });
    } else {
      throw err;
    }
  }

  return eth;
}

// ─────────────── WalletConnect v2 (deeplink у MM) ───────────────
// @ts-ignore
import EthereumProvider from '@walletconnect/ethereum-provider';

async function connectWalletConnect(): Promise<Eip1193Provider> {
  if (!WC_PROJECT_ID) throw new Error('VITE_WC_PROJECT_ID не заданий у середовищі!');

  const provider: Eip1193Provider = (await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    showQrModal: false, // будемо відкривати MM самі
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
      'eth_chainId',
      'eth_accounts',
    ],
    events: ['chainChanged', 'accountsChanged', 'disconnect', 'session_event'],
    rpcMap: { [CHAIN_ID_DEC]: 'https://bsc-dataseed.binance.org/' },
    metadata: {
      name: 'Buy My Behavior',
      description: 'Web3 escrow',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/icon.png'],
    },
    qrModalOptions: {
      desktopLinks: ['metamask'],
      mobileLinks: ['metamask'],
      preferDesktop: false,
    },
  })) as any;

  // WC видає URI → відкриваємо MetaMask через deeplink
  provider.on?.('display_uri', (uri: string) => {
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try {
      window.location.href = link;
    } catch {}
    setTimeout(() => {
      try {
        window.open(link, '_blank');
      } catch {}
    }, 300);
  });

  try {
    await provider.connect();
  } catch (e) {
    throw e;
  }

  // перестраховка: правильна мережа
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }] as any,
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: 'Binance Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: ['https://bsc-dataseed.binance.org/'],
            blockExplorerUrls: ['https://bscscan.com'],
          },
        ] as any,
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX }] as any,
      });
    }
  }

  return provider;
}

// ─────────────── Публічне API ───────────────
export async function connectWallet(): Promise<{ provider: Eip1193Provider }> {
  if (_cachedProvider) return { provider: _cachedProvider };

  // 1) Desktop з вже інʼєктованим MM
  if (!IS_MOBILE && (window as any).ethereum?.isMetaMask) {
    _cachedProvider = (window as any).ethereum;
    return { provider: _cachedProvider };
  }

  // 2) Мобільний: спочатку MMSDK, якщо юзер відмінив/не вдалось — WC
  if (IS_MOBILE) {
    try {
      _cachedProvider = await connectMetaMaskSDK();
      return { provider: _cachedProvider };
    } catch {
      _cachedProvider = await connectWalletConnect();
      return { provider: _cachedProvider };
    }
  }

  // 3) Десктоп без MM
  throw new Error('Не знайдено ні MetaMask, ні WalletConnect провайдера.');
}

export async function ensureBSC(provider: Eip1193Provider): Promise<void> {
  try {
    const cid = await provider.request({ method: 'eth_chainId' });
    if (String(cid).toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;
  } catch {}

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }] as any,
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: 'Binance Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: ['https://bsc-dataseed.binance.org/'],
            blockExplorerUrls: ['https://bscscan.com'],
          },
        ] as any,
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX }] as any,
      });
    } else {
      throw err;
    }
  }
}
