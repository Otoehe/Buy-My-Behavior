/* eslint-disable @typescript-eslint/no-explicit-any */

// Універсальний міст провайдерів для мобільного браузера (не MetaMask in-app).
// Стратегія: MetaMask SDK (deeplink) → fallback WalletConnect v2 (deeplink на MM).
// Повертає стабільний EIP-1193 провайдер, яким користуються всі on-chain дії.

import type { ExternalProvider } from '@ethersproject/providers';

export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
} & ExternalProvider;

const IS_MOBILE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

const CHAIN_ID_HEX = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // BSC mainnet by default
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX.startsWith('0x') ? CHAIN_ID_HEX : '0x' + Number(CHAIN_ID_HEX).toString(16), 16);

// WalletConnect project id (обов’язково)
const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID as string;

// Кеш обраного провайдера, щоб approve і lockFunds йшли через той самий канал
let _cachedProvider: Eip1193Provider | null = null;

// ───────────────── MetaMask SDK ─────────────────
let _sdk: any | null = null;

async function connectMetaMaskSDK(): Promise<Eip1193Provider> {
  // динамичний імпорт, щоб не тягнути SDK на десктоп
  const { default: MetaMaskSDK } = await import('@metamask/sdk');

  if (!_sdk) {
    _sdk = new MetaMaskSDK({
      injectProvider: true,
      // критично на мобільних — працюємо через deep link, НЕ відкриваємо ваш сайт у MM-браузері
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

    // створюємо інʼєктований provider
    _sdk.getProvider();
  }

  const eth = (window as any).ethereum as Eip1193Provider | undefined;
  if (!eth) throw new Error('MetaMask provider не інʼєктувався');

  try {
    // 1) конект до гаманця
    await _sdk.connect();

    // 2) запит доступу до акаунтів (на iOS інколи потрібно двічі)
    try {
      await eth.request({ method: 'eth_requestAccounts' });
    } catch {
      try {
        await eth.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] as any });
      } catch {}
      await eth.request({ method: 'eth_accounts' });
    }

    // 3) перемикання на потрібну мережу
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + CHAIN_ID_DEC.toString(16) }] as any });
    } catch (err: any) {
      if (err?.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x' + CHAIN_ID_DEC.toString(16),
            chainName: 'Binance Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: ['https://bsc-dataseed.binance.org/'],
            blockExplorerUrls: ['https://bscscan.com'],
          }] as any,
        });
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + CHAIN_ID_DEC.toString(16) }] as any });
      } else {
        throw err;
      }
    }
  } catch (e) {
    // якщо користувач відмінив — пробуємо інший шлях
    throw e;
  }

  return eth;
}

// ───────────────── WalletConnect v2 (мануальний deeplink на MetaMask) ─────────────────
/// @ts-ignore — типи не завжди підтягуються коректно у Vite
import EthereumProvider from '@walletconnect/ethereum-provider';

async function connectWalletConnect(): Promise<Eip1193Provider> {
  if (!WC_PROJECT_ID) {
    throw new Error('VITE_WC_PROJECT_ID не заданий у середовищі!');
  }

  const provider: Eip1193Provider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    showQrModal: false, // самі зробимо deeplink
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
    rpcMap: {
      [CHAIN_ID_DEC]: 'https://bsc-dataseed.binance.org/',
    },
    metadata: {
      name: 'Buy My Behavior',
      description: 'Web3 escrow',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/icon.png'],
    },
  }) as any;

  // Коли WalletConnect готовий — отримаємо URI і прокинемо його в MetaMask через deeplink
  provider.on?.('display_uri', (uri: string) => {
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = link; } catch {}
    // резерв — відкрити в новій вкладці (деякі лаунчери так спрацьовують)
    setTimeout(() => {
      try { window.open(link, '_blank'); } catch {}
    }, 400);
  });

  // встановлюємо сесію, якщо ще нема
  try {
    await provider.connect();
  } catch (e) {
    // користувач міг скасувати в MetaMask — перекидаємо помилку вище
    throw e;
  }

  // перестраховка: перемикаємось на потрібну мережу
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + CHAIN_ID_DEC.toString(16) }] as any });
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x' + CHAIN_ID_DEC.toString(16),
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com'],
        }] as any,
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + CHAIN_ID_DEC.toString(16) }] as any });
    }
  }

  return provider;
}

// ───────────────── Публічне API ─────────────────

export async function connectWallet(): Promise<{ provider: Eip1193Provider }> {
  if (_cachedProvider) return { provider: _cachedProvider };

  // 1) Desktop/мобільний з уже інʼєктованим MM — використовуємо його
  if (!IS_MOBILE && (window as any).ethereum?.isMetaMask) {
    _cachedProvider = (window as any).ethereum;
    return { provider: _cachedProvider };
  }

  // 2) Мобільний: пробуємо MetaMask SDK (deeplink назад у додаток MM і назад у браузер)
  if (IS_MOBILE) {
    try {
      _cachedProvider = await connectMetaMaskSDK();
      return { provider: _cachedProvider };
    } catch {
      // 3) Fallback: WalletConnect v2 з миттєвим deeplink у MetaMask
      _cachedProvider = await connectWalletConnect();
      return { provider: _cachedProvider };
    }
  }

  // 4) Десктоп без MM → кидаємо помилку
  throw new Error('Не знайдено ні MetaMask, ні WalletConnect провайдера.');
}

export async function ensureBSC(provider: Eip1193Provider): Promise<void> {
  // звіряємо цільову мережу
  try {
    const cid = await provider.request({ method: 'eth_chainId' });
    if (String(cid).toLowerCase() === ('0x' + CHAIN_ID_DEC.toString(16))) return;
  } catch {}

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + CHAIN_ID_DEC.toString(16) }] as any });
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x' + CHAIN_ID_DEC.toString(16),
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com'],
        }] as any,
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + CHAIN_ID_DEC.toString(16) }] as any });
    } else {
      throw err;
    }
  }
}
