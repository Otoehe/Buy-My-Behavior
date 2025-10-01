/* eslint-disable @typescript-eslint/no-explicit-any */

// Універсальний міст провайдерів для браузера/мобільного.
// НОВЕ: на мобільному ПРИМУСОВО використовуємо WalletConnect v2 → deeplink у MetaMask.
// Це усуває зависання "Return to app" з MetaMask SDK.

import type { ExternalProvider } from '@ethersproject/providers';

// ---- тип EIP-1193
export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
} & ExternalProvider;

const IS_MOBILE =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // BSC mainnet
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : '0x' + Number(RAW_CHAIN_ID).toString(16);
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

// WalletConnect Project ID (обов’язково)
const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID as string;

// Кеш провайдера
let _cachedProvider: Eip1193Provider | null = null;

// ───────────────── WalletConnect v2 (deeplink у MetaMask) ─────────────────
// @ts-ignore: інколи типи сипляться у Vite
import EthereumProvider from '@walletconnect/ethereum-provider';

async function connectWalletConnect(): Promise<Eip1193Provider> {
  if (!WC_PROJECT_ID) throw new Error('VITE_WC_PROJECT_ID не заданий у середовищі!');

  const provider: Eip1193Provider = (await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    showQrModal: false,
    chains: [CHAIN_ID_DEC],
    optionalChains: [CHAIN_ID_DEC],
    methods: [
      'eth_sendTransaction', 'personal_sign', 'eth_signTypedData', 'eth_sign',
      'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'eth_requestAccounts',
    ],
    events: ['chainChanged', 'accountsChanged', 'disconnect', 'session_event', 'display_uri'],
    rpcMap: { [CHAIN_ID_DEC]: 'https://bsc-dataseed.binance.org/' },
    metadata: {
      name: 'Buy My Behavior',
      description: 'Web3 escrow',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/icon.png'],
    },
    qrModalOptions: { desktopLinks: ['metamask'], mobileLinks: ['metamask'], preferDesktop: false },
  })) as any;

  // Коли WC видає URI — робимо deeplink у MetaMask
  const openMM = (uri: string) => {
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.assign(link); } catch {}
    // резерв (деякі лаунчери краще відкривають у новій вкладці)
    setTimeout(() => { try { window.open(link, '_blank'); } catch {} }, 400);
  };

  // інколи display_uri приходить пізніше — слухаємо подію
  provider.on?.('display_uri', (uri: string) => openMM(uri));

  // Запускаємо сесію. На Android MetaMask сама покаже акаунти.
  await provider.connect();

  // Достраховка: витягнемо accounts (деякі прошивки дають їх лише після запиту)
  try { await provider.request({ method: 'eth_requestAccounts' }); } catch {}

  // Перемикаємось на потрібну мережу
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

  // Автовідновлення після розриву
  provider.on?.('disconnect', () => { _cachedProvider = null; });

  return provider;
}

// ───────────────── Desktop MetaMask (вже інʼєктований) ─────────────────

async function connectInjectedDesktop(): Promise<Eip1193Provider> {
  const eth = (window as any).ethereum as Eip1193Provider | undefined;
  if (!eth?.isMetaMask) throw new Error('MetaMask не інʼєктований');
  try { await eth.request({ method: 'eth_requestAccounts' }); } catch {}
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
    }
  }
  return eth;
}

// ───────────────── Публічне API ─────────────────

export async function connectWallet(): Promise<{ provider: Eip1193Provider }> {
  if (_cachedProvider) return { provider: _cachedProvider };

  // Десктоп — беремо інʼєктований
  if (!IS_MOBILE && (window as any).ethereum?.isMetaMask) {
    _cachedProvider = await connectInjectedDesktop();
    return { provider: _cachedProvider };
  }

  // Мобільний — ПРИМУСОВО WC → MetaMask deeplink (без SDK)
  _cachedProvider = await connectWalletConnect();
  return { provider: _cachedProvider };
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
