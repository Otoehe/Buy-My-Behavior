/* eslint-disable @typescript-eslint/no-explicit-any */
// Універсальний міст провайдерів для мобільного браузера.
// Стратегія: injected (MetaMask in-app або десктоп) → MetaMask SDK (deeplink) → WalletConnect v2.
// Повертає стабільний EIP-1193 провайдер.

export type Eip1193Request = (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
export interface Eip1193Provider {
  request: Eip1193Request;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
  isConnected?: () => boolean;
  connect?: () => Promise<void>;
  chainId?: string | number;
}

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38';
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const BSC_RPC = (import.meta.env.VITE_BSC_RPC as string) || 'https://bsc-dataseed.binance.org';
const APP_NAME = (import.meta.env.VITE_APP_NAME as string) || 'Buy My Behavior';
const APP_URL  = (import.meta.env.VITE_PUBLIC_APP_URL as string) || (typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com');
const WC_PID   = import.meta.env.VITE_WC_PROJECT_ID as string;

let connectInFlight: Promise<{ provider: Eip1193Provider; accounts: string[]; chainId: string }> | null = null;

const ua = () => (typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '');
const isMobileUA = () => /android|iphone|ipad|ipod/i.test(ua());
const getInjected = (): Eip1193Provider | null => {
  const eth = (globalThis as any).ethereum as Eip1193Provider | undefined;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length) {
    const mm = eth.providers.find((p: any) => p && p.isMetaMask);
    return (mm || eth.providers[0]) as Eip1193Provider;
  }
  return eth || null;
};

async function requestWithConnect<T = any>(provider: Eip1193Provider, args: { method: string; params?: any[] | Record<string, any> }): Promise<T> {
  try {
    if (args.method !== 'eth_requestAccounts' && typeof provider.connect === 'function') {
      try { await provider.connect(); } catch {}
    }
    return await provider.request(args);
  } catch (err: any) {
    if (err?.code === -32002 || /already pending/i.test(String(err?.message || ''))) {
      // очікуємо поки користувач підтвердить у гаманці
      await new Promise(r => setTimeout(r, 1500));
      if (args.method === 'eth_requestAccounts') {
        try { return await provider.request({ method: 'eth_accounts' } as any); } catch {}
      }
    }
    throw err;
  }
}

// ── MetaMask SDK (deeplink)
let _sdk: any | null = null;
async function connectViaMetaMaskSDK(): Promise<{ provider: Eip1193Provider; accounts: string[]; chainId: string }> {
  const { default: MetaMaskSDK } = await import('@metamask/sdk');
  if (!_sdk) {
    _sdk = new MetaMaskSDK({
      dappMetadata: { name: APP_NAME, url: APP_URL },
      useDeeplink: true,
      shouldShimWeb3: true,
      checkInstallationImmediately: false,
      logging: { developerMode: false },
      enableAnalytics: false,
    });
  }
  const provider = _sdk.getProvider() as Eip1193Provider;
  (globalThis as any).ethereum = provider; // шимуємо для стороннього коду
  const accounts: string[] = await requestWithConnect(provider, { method: 'eth_requestAccounts' });
  let chainId: any = await requestWithConnect(provider, { method: 'eth_chainId' });
  if (typeof chainId === 'number') chainId = '0x' + chainId.toString(16);
  return { provider, accounts, chainId: String(chainId) };
}

// ── WalletConnect (fallback)
let _wcProv: any | null = null;
async function connectViaWalletConnect(): Promise<{ provider: Eip1193Provider; accounts: string[]; chainId: string }> {
  if (!WC_PID) throw new Error('VITE_WC_PROJECT_ID missing');
  const { default: EthereumProvider } = await import('@walletconnect/ethereum-provider');
  _wcProv = await (EthereumProvider as any).init({
    projectId: WC_PID,
    showQrModal: false,
    chains: [parseInt(CHAIN_ID_HEX, 16)],
    optionalChains: [parseInt(CHAIN_ID_HEX, 16)],
    methods: [
      'eth_chainId','eth_accounts','eth_requestAccounts',
      'wallet_switchEthereumChain','wallet_addEthereumChain',
      'eth_sendTransaction','personal_sign','eth_sign','eth_signTypedData','eth_signTypedData_v4'
    ],
    events: ['display_uri','accountsChanged','chainChanged','disconnect'],
    rpcMap: { [parseInt(CHAIN_ID_HEX, 16)]: BSC_RPC },
    metadata: { name: APP_NAME, url: APP_URL, description: 'BMB dapp', icons: ['https://www.buymybehavior.com/favicon.ico'] },
  });

  _wcProv.on?.('display_uri', (uri: string) => {
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = link; } catch {}
    setTimeout(() => { try { window.open(link, '_blank'); } catch {} }, 250);
  });

  try { await _wcProv.connect(); } catch {}
  (globalThis as any).ethereum = _wcProv; // щоб інший код бачив provider
  const accounts: string[] = await requestWithConnect(_wcProv, { method: 'eth_requestAccounts' });
  let chainId: any = await requestWithConnect(_wcProv, { method: 'eth_chainId' });
  if (typeof chainId === 'number') chainId = '0x' + chainId.toString(16);
  return { provider: _wcProv, accounts, chainId: String(chainId) };
}

// ── Публічне API
export async function connectWallet(): Promise<{ provider: Eip1193Provider }> {
  if (!connectInFlight) {
    connectInFlight = (async () => {
      const injected = getInjected();

      // 1) injected (десктоп або MetaMask in-app)
      if (injected && (!isMobileUA() || injected.isMetaMask)) {
        try {
          const accs: string[] = await requestWithConnect(injected, { method: 'eth_accounts' });
          if (!accs?.length) await requestWithConnect(injected, { method: 'eth_requestAccounts' });
        } catch {}
        return { provider: injected, accounts: [], chainId: '0x0' };
      }

      // 2) мобільний: MetaMask SDK → WC
      if (isMobileUA()) {
        try { const r = await connectViaMetaMaskSDK(); return { provider: r.provider }; }
        catch { const r = await connectViaWalletConnect(); return { provider: r.provider }; }
      }

      throw new Error('NO_WALLET_AVAILABLE');
    })().finally(() => setTimeout(() => { connectInFlight = null; }, 450));
  }
  const r = await connectInFlight;
  return { provider: r.provider };
}

export async function ensureBSC(provider: Eip1193Provider): Promise<void> {
  let id: any;
  try { id = await provider.request({ method: 'eth_chainId' }); } catch {}
  const hex = typeof id === 'number' ? '0x' + id.toString(16) : String(id || '').toLowerCase();
  if (hex === CHAIN_ID_HEX.toLowerCase()) return;
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
          rpcUrls: [BSC_RPC],
          blockExplorerUrls: ['https://bscscan.com'],
        }],
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    } else {
      throw err;
    }
  }
}
