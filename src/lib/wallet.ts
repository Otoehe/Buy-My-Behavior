/* eslint-disable @typescript-eslint/no-explicit-any */

// ───────────────────────────────────────────────────────────────────────────────
// BMB wallet helper (MetaMask desktop/mobile + WalletConnect v2)
// Fix: "Please call connect() before request()" — гарантуємо connect() перед request()
// Reentrancy-safe: усуває -32002 'already pending'
// Публічний API збережено:
//   - export type Eip1193Provider / Eip1193Request
//   - export async function connectWallet(opts?)
//   - export async function ensureBSC(provider)
//   - export getChainId / getAccounts / hasInjectedMetaMask
// ───────────────────────────────────────────────────────────────────────────────

export type Eip1193Request = (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
export interface Eip1193Provider {
  request: Eip1193Request;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
  // WalletConnect/ін. SDK інколи мають ці поля:
  isConnected?: () => boolean;
  connect?: () => Promise<void>;
  session?: unknown;
  chainId?: string | number;
}

type ConnectResult = { provider: Eip1193Provider; accounts: string[]; chainId: string };

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // 56
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const WC_PROJECT_ID = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  import.meta.env.VITE_WC_PROJECT_ID) as string | undefined;

const BSC_RPC = (import.meta.env.VITE_BSC_RPC as string) || 'https://bsc-dataseed.binance.org';
const APP_NAME = (import.meta.env.VITE_APP_NAME as string) || 'Buy My Behavior';
const APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL as string) || (typeof window !== 'undefined' ? window.location.origin : 'https://buymybehavior.com');

let connectInFlight: Promise<ConnectResult> | null = null;
const inflightByKey = new Map<string, Promise<any>>();

function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}
function getInjected(): Eip1193Provider | null {
  const eth = (globalThis as any).ethereum as Eip1193Provider | undefined;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length) {
    const mm = eth.providers.find((p: any) => p && p.isMetaMask);
    return (mm || eth.providers[0]) as Eip1193Provider;
  }
  return eth as Eip1193Provider;
}
function delay(ms: number) { return new Promise((res) => setTimeout(res, ms)); }
async function pollAccounts(provider: Eip1193Provider, timeoutMs = 30000, stepMs = 500): Promise<string[]> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const accs: string[] = await provider.request({ method: 'eth_accounts' });
      if (accs?.length) return accs;
    } catch {}
    await delay(stepMs);
  }
  return [];
}

// ── Глобальний захист: будь-який request ретраїмо після connect() при потребі
async function requestWithConnect<T = any>(
  provider: Eip1193Provider,
  args: { method: string; params?: any[] | Record<string, any> },
  keyHint?: string
): Promise<T> {
  const key = keyHint ?? args.method;
  if (!inflightByKey.has(key)) {
    inflightByKey.set(
      key,
      (async () => {
        try {
          // не викликаємо connect рекурсивно для eth_requestAccounts
          if (args.method !== 'eth_requestAccounts' && typeof provider.connect === 'function') {
            const isConn = typeof provider.isConnected === 'function' ? provider.isConnected() : Boolean((provider as any).session);
            if (!isConn) { try { await provider.connect!(); } catch {} }
          }
          return await provider.request(args);
        } catch (err: any) {
          const msg = String(err?.message || '');
          if (/connect\(\)\s*before\s*request\(\)/i.test(msg)) {
            // прямий кейс WalletConnect: робимо connect та повторюємо запит
            try { await provider.connect?.(); } catch {}
            // ще раз спробуємо
            return await provider.request(args);
          }
          if (err?.code === -32002 || /already pending/i.test(msg)) {
            // дочекаймося розблокування (MetaMask UX)
            const res = await pollAccounts(provider, 30000, 500);
            if (args.method === 'eth_requestAccounts' && res.length) return res as any;
          }
          throw err;
        } finally {
          setTimeout(() => inflightByKey.delete(key), 400);
        }
      })()
    );
  }
  return inflightByKey.get(key)!;
}

export function openMetaMaskDeeplink(): void {
  if (typeof window === 'undefined') return;
  const host = window.location.host || new URL(APP_URL).host;
  window.location.href = `https://metamask.app.link/dapp/${host}`;
}

async function getWalletConnectProvider(): Promise<Eip1193Provider> {
  if (!WC_PROJECT_ID) throw new Error('WalletConnect project id not set (VITE_WALLETCONNECT_PROJECT_ID).');
  const { default: EthereumProvider } = await import('@walletconnect/ethereum-provider');
  const provider = (await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    showQrModal: true,
    metadata: {
      name: APP_NAME,
      description: 'BMB Web3 dapp',
      url: APP_URL,
      icons: [`${APP_URL}/icons/bmb-192.png`],
    },
    chains: [parseInt(CHAIN_ID_HEX, 16)],
    optionalChains: [56],
    rpcMap: { [parseInt(CHAIN_ID_HEX, 16)]: BSC_RPC, 56: BSC_RPC },
  })) as unknown as Eip1193Provider;

  // 🔑 головне: встановити сесію ДО перших request()
  try { await provider.connect?.(); } catch {}
  return provider;
}

async function connectInjectedOnce(): Promise{ provider: Eip1193Provider; accounts: string[]; chainId: string } {
  const provider = getInjected();
  if (!provider) throw new Error('NO_INJECTED_PROVIDER');

  try {
    const accs: string[] = await requestWithConnect(provider, { method: 'eth_accounts' });
    const chainId: string = await requestWithConnect(provider, { method: 'eth_chainId' });
    if (accs?.length) return { provider, accounts: accs, chainId };
  } catch {}

  const accounts: string[] = await requestWithConnect(provider, { method: 'eth_requestAccounts' });
  const chainId: string = await requestWithConnect(provider, { method: 'eth_chainId' });
  return { provider, accounts, chainId };
}

export async function connectWallet(opts?: { prefer?: 'metamask' | 'walletconnect'; allowDeepLinkMobile?: boolean }): Promise<ConnectResult> {
  if (!connectInFlight) {
    connectInFlight = (async () => {
      // 1) injected (MetaMask in-app / desktop)
      if (opts?.prefer !== 'walletconnect') {
        const injected = getInjected();
        if (injected) {
          try { return await connectInjectedOnce(); }
          catch (err: any) { if (opts?.prefer === 'metamask') throw err; }
        }
      }

      // 2) WalletConnect v2
      if (opts?.prefer === 'walletconnect' || (!getInjected() && WC_PROJECT_ID)) {
        const wc = await getWalletConnectProvider();        // ← тут уже connect()
        const accounts: string[] = await requestWithConnect(wc, { method: 'eth_requestAccounts' });
        let cid = await requestWithConnect<any>(wc, { method: 'eth_chainId' });
        if (typeof cid === 'number') cid = '0x' + cid.toString(16);
        return { provider: wc, accounts, chainId: String(cid) };
      }

      // 3) Mobile без injected → deeplink у MetaMask
      if (!getInjected() && isMobileUA() && (opts?.allowDeepLinkMobile ?? true)) {
        openMetaMaskDeeplink();
        throw new Error('REDIRECTED_TO_METAMASK_APP');
      }

      throw new Error('NO_WALLET_AVAILABLE');
    })().finally(() => setTimeout(() => { connectInFlight = null; }, 450));
  }
  return connectInFlight;
}

export async function ensureBSC(provider: Eip1193Provider): Promise<void> {
  // завжди через requestWithConnect — щоб автоконектитись при потребі
  let chainId: any = await requestWithConnect(provider, { method: 'eth_chainId' });
  if (typeof chainId === 'number') chainId = '0x' + chainId.toString(16);
  if (String(chainId).toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;

  try {
    await requestWithConnect(provider, { method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] }, 'wallet_switchEthereumChain');
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (err?.code === 4902 || /Unrecognized chain|not added/i.test(msg)) {
      await requestWithConnect(provider, {
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: [BSC_RPC],
          blockExplorerUrls: ['https://bscscan.com'],
        }],
      }, 'wallet_addEthereumChain');
      return;
    }
    throw err;
  }
}

export async function getChainId(provider: Eip1193Provider): Promise<string> {
  const id = await requestWithConnect<any>(provider, { method: 'eth_chainId' });
  return typeof id === 'number' ? '0x' + id.toString(16) : String(id);
}
export async function getAccounts(provider: Eip1193Provider): Promise<string[]> {
  return requestWithConnect(provider, { method: 'eth_accounts' });
}
export function hasInjectedMetaMask(): boolean {
  const p = getInjected();
  return Boolean(p && (p as any).isMetaMask);
}
