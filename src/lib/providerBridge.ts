// src/lib/providerBridge.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExternalProvider } from '@ethersproject/providers';
import EthereumProvider from '@walletconnect/ethereum-provider';

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

// ---- WalletConnect v2 (deeplink у MetaMask) ----
async function connectWalletConnect(): Promise<Eip1193Provider> {
  if (!WC_PROJECT_ID) throw new Error('VITE_WC_PROJECT_ID не заданий!');
  const provider: any = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    showQrModal: false,
    chains: [CHAIN_ID_DEC],
    optionalChains: [CHAIN_ID_DEC],
    methods: [
      'eth_sendTransaction','personal_sign','eth_signTypedData','eth_sign',
      'wallet_switchEthereumChain','wallet_addEthereumChain','eth_requestAccounts'
    ],
    events: ['display_uri','chainChanged','accountsChanged','disconnect','session_event'],
    rpcMap: { [CHAIN_ID_DEC]: 'https://bsc-dataseed.binance.org/' },
    metadata: {
      name: 'Buy My Behavior',
      description: 'Web3 escrow',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/icon.png'],
    },
  });

  provider.on?.('display_uri', (uri: string) => {
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = link; } catch {}
    setTimeout(() => { try { window.open(link, '_blank'); } catch {} }, 400);
  });

  try { await provider.connect(); } catch (e) { throw e; }

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
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
        }],
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    }
  }

  return provider as Eip1193Provider;
}

// ---- Публічне API ----
export async function connectWallet(): Promise<{ provider: Eip1193Provider }> {
  if (_cachedProvider) return { provider: _cachedProvider };

  // 0) Якщо вже є window.ethereum — використовуємо його (навіть на мобільному)
  const injected = (window as any)?.ethereum as Eip1193Provider | undefined;
  if (injected) {
    _cachedProvider = injected;
    return { provider: _cachedProvider };
  }

  // 1) Мобільний: підіймаємо WalletConnect
  if (IS_MOBILE) {
    _cachedProvider = await connectWalletConnect();
    (window as any).ethereum = _cachedProvider; // на всяк випадок
    return { provider: _cachedProvider };
  }

  // 2) Десктоп без інʼєкції → помилка
  throw new Error('Не знайдено ні MetaMask, ні WalletConnect провайдера.');
}

export async function ensureBSC(provider: Eip1193Provider): Promise<void> {
  try {
    const cid = await provider.request({ method: 'eth_chainId' });
    if (String(cid).toLowerCase() === CHAIN_ID_HEX) return;
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
