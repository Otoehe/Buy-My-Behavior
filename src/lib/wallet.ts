/* eslint-disable @typescript-eslint/no-explicit-any */

// ───────────────────────────────────────────────────────────────────────────────
// BMB wallet helper (MetaMask desktop/mobile + optional WalletConnect v2)
// Additive, reentrancy-safe, keeps public API stable:
//   - export type Eip1193Provider
//   - export async function connectWallet(opts?)
//   - export async function ensureBSC(provider)
// No UI changes, no side effects beyond provider requests.
// ───────────────────────────────────────────────────────────────────────────────

export type Eip1193Request = (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
export interface Eip1193Provider {
  request: Eip1193Request;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  // MetaMask flags (if present)
  isMetaMask?: boolean;
  providers?: Eip1193Provider[]; // in case multiple injected providers
}

type ConnectResult = { provider: Eip1193Provider; accounts: string[]; chainId: string };

// ───────── Env (all optional except CHAIN) ─────────
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // 0x38 = 56
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const WC_PROJECT_ID = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  import.meta.env.VITE_WC_PROJECT_ID) as string | undefined;

// BSC public RPC as fallback for WC addChain metadata only (not used for MM)
const BSC_RPC = (import.meta.env.VITE_BSC_RPC as string) || 'https://bsc-dataseed.binance.org';
const APP_NAME = (import.meta.env.VITE_APP_NAME as string) || 'Buy My Behavior';
const APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL as string) || (typeof window !== 'undefined' ? window.location.origin : 'https://buymybehavior.com');

// ───────── Internal state to avoid -32002 reentry ─────────
let connectInFlight: Promise<ConnectResult> | null = null;

// Guard map per method in case we extend later
const inflightByMethod = new Map<string, Promise<any>>();

// ───────── Utilities ─────────
function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function getInjected(): Eip1193Provider | null {
  const eth = (globalThis as any).ethereum as Eip1193Provider | undefined;
  if (!eth) return null;
  // If multiple providers injected (e.g., MM + others), prefer MetaMask
  if (Array.isArray(eth.providers) && eth.providers.length) {
    const mm = eth.providers.find((p: any) => p && p.isMetaMask);
    return (mm || eth.providers[0]) as Eip1193Provider;
  }
  return eth as Eip1193Provider;
}

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function pollAccounts(provider: Eip1193Provider, timeoutMs = 30000, stepMs = 500): Promise<string[]> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const accs: string[] = await provider.request({ method: 'eth_accounts' });
      if (accs && accs.length) return accs;
    } catch {
      // ignore
    }
    await delay(stepMs);
  }
  return [];
}

// MetaMask mobile deeplink to our dapp (if no injection present)
export function openMetaMaskDeeplink(): void {
  if (typeof window === 'undefined') return;
  const host = window.location.host || new URL(APP_URL).host;
  const proto = 'https://metamask.app.link/dapp/';
  // ensure plain host (no path), MM app will open our site inside IAB
  const url = `${proto}${host}`;
  window.location.href = url;
}

// ───────── WalletConnect (optional, dynamically imported) ─────────
async function getWalletConnectProvider(): Promise<Eip1193Provider> {
  if (!WC_PROJECT_ID) {
    throw new Error('WalletConnect project id is not set (VITE_WALLETCONNECT_PROJECT_ID).');
  }
  // Lazy import so the bundle isn’t heavy if not used
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
    chains: [Number(CHAIN_ID_HEX)],
    optionalChains: [56],
    rpcMap: {
      [Number(CHAIN_ID_HEX)]: BSC_RPC,
      56: BSC_RPC,
    },
  })) as unknown as Eip1193Provider;
  return provider;
}

// ───────── Core connect (reentrancy-safe) ─────────
async function connectInjectedOnce(): Promise<ConnectResult> {
  const provider = getInjected();
  if (!provider) {
    throw new Error('NO_INJECTED_PROVIDER');
  }

  // 1) if already connected
  try {
    const current: string[] = await provider.request({ method: 'eth_accounts' });
    const chainId: string = await provider.request({ method: 'eth_chainId' });
    if (current && current.length) return { provider, accounts: current, chainId };
  } catch {
    // ignore
  }

  // 2) request accounts (single in-flight guard to avoid -32002)
  const key = 'eth_requestAccounts';
  if (!inflightByMethod.has(key)) {
    inflightByMethod.set(
      key,
      provider
        .request({ method: 'eth_requestAccounts' })
        .catch(async (err: any) => {
          // -32002 means "already pending" — wait for user action and poll accounts
          if (err && (err.code === -32002 || String(err.message || '').includes('already pending'))) {
            const accs = await pollAccounts(provider, 30000, 500);
            if (accs.length) return accs;
          }
          throw err;
        })
        .finally(() => {
          // release after small grace period to prevent bounce re-clicks
          setTimeout(() => inflightByMethod.delete(key), 400);
        }),
    );
  }

  const accounts: string[] = await inflightByMethod.get(key)!;
  const chainId: string = await provider.request({ method: 'eth_chainId' });
  return { provider, accounts, chainId };
}

// Public API: connectWallet
export async function connectWallet(opts?: { prefer?: 'metamask' | 'walletconnect'; allowDeepLinkMobile?: boolean }): Promise<ConnectResult> {
  if (!connectInFlight) {
    connectInFlight = (async () => {
      // 1) Preferred flow or injected present
      if (opts?.prefer !== 'walletconnect') {
        const injected = getInjected();
        if (injected) {
          try {
            return await connectInjectedOnce();
          } catch (err: any) {
            // fallback to WC if requested later
            if (opts?.prefer === 'metamask') throw err;
          }
        }
      }

      // 2) WalletConnect fallback (optional)
      if (opts?.prefer === 'walletconnect' || (!getInjected() && WC_PROJECT_ID)) {
        const wc = await getWalletConnectProvider();
        const accounts: string[] = await wc.request({ method: 'eth_requestAccounts' });
        const chainId: string = await wc.request({ method: 'eth_chainId' }).catch(async () => {
          // Some WC stacks return number; normalize
          const id = await wc.request({ method: 'eth_chainId' });
          return typeof id === 'number' ? '0x' + id.toString(16) : String(id);
        });
        return { provider: wc, accounts, chainId };
      }

      // 3) Mobile: no injection and no WC → open MetaMask deeplink
      if (!getInjected() && isMobileUA() && (opts?.allowDeepLinkMobile ?? true)) {
        openMetaMaskDeeplink();
        throw new Error('REDIRECTED_TO_METAMASK_APP');
      }

      // If we are here — no providers available
      throw new Error('NO_WALLET_AVAILABLE');
    })().finally(() => {
      // small debounce to collapse rapid multiple clicks across components
      setTimeout(() => {
        connectInFlight = null;
      }, 450);
    });
  }
  return connectInFlight;
}

// Public API: ensureBSC
export async function ensureBSC(provider: Eip1193Provider): Promise<void> {
  // normalize chainId read
  let chainId: string = await provider.request({ method: 'eth_chainId' });
  if (typeof chainId === 'number') chainId = '0x' + chainId.toString(16);

  if (chainId?.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }],
    });
    return;
  } catch (err: any) {
    // 4902 = chain not added
    if (err && (err.code === 4902 || String(err.message || '').includes('Unrecognized chain'))) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: 'Binance Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: [BSC_RPC],
            blockExplorerUrls: ['https://bscscan.com'],
          },
        ],
      });
      return;
    }
    throw err;
  }
}

// Convenience helpers (optional to use in the app)
export async function getChainId(provider: Eip1193Provider): Promise<string> {
  const id = await provider.request({ method: 'eth_chainId' });
  return typeof id === 'number' ? '0x' + id.toString(16) : String(id);
}
export async function getAccounts(provider: Eip1193Provider): Promise<string[]> {
  return provider.request({ method: 'eth_accounts' });
}
export function hasInjectedMetaMask(): boolean {
  const p = getInjected();
  return Boolean(p && (p as any).isMetaMask);
}
