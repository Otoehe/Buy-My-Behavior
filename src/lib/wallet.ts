/* eslint-disable @typescript-eslint/no-explicit-any */

// ───────────────────────────────────────────────────────────────────────────────
// BMB wallet helper (MetaMask desktop/mobile + optional WalletConnect v2)
// Reentrancy-safe: усуває -32002 'already pending'
// Публічний API зберігаємо:
//   - export type Eip1193Provider
//   - export async function connectWallet(opts?)
//   - export async function ensureBSC(provider)
// ───────────────────────────────────────────────────────────────────────────────

export type Eip1193Request = (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
export interface Eip1193Provider {
  request: Eip1193Request;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
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
const inflightByMethod = new Map<string, Promise<any>>();

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
    chains: [Number(CHAIN_ID_HEX)],
    optionalChains: [56],
    rpcMap: { [Number(CHAIN_ID_HEX)]: BSC_RPC, 56: BSC_RPC },
  })) as unknown as Eip1193Provider;
  return provider;
}

async function connectInjectedOnce(): Promise<ConnectResult> {
  const provider = getInjected();
  if (!provider) throw new Error('NO_INJECTED_PROVIDER');

  try {
    const accs: string[] = await provider.request({ method: 'eth_accounts' });
    const chainId: string = await provider.request({ method: 'eth_chainId' });
    if (accs?.length) return { provider, accounts: accs, chainId };
  } catch {}

  const key = 'eth_requestAccounts';
  if (!inflightByMethod.has(key)) {
    inflightByMethod.set(
      key,
      provider
        .request({ method: 'eth_requestAccounts' })
        .catch(async (err: any) => {
          if (err && (err.code === -32002 || String(err.message || '').includes('already pending'))) {
            const accs = await pollAccounts(provider, 30000, 500);
            if (accs.length) return accs;
          }
          throw err;
        })
        .finally(() => setTimeout(() => inflightByMethod.delete(key), 400)),
    );
  }
  const accounts: string[] = await inflightByMethod.get(key)!;
  const chainId: string = await provider.request({ method: 'eth_chainId' });
  return { provider, accounts, chainId };
}

export async function connectWallet(opts?: { prefer?: 'metamask' | 'walletconnect'; allowDeepLinkMobile?: boolean }): Promise<ConnectResult> {
  if (!connectInFlight) {
    connectInFlight = (async () => {
      if (opts?.prefer !== 'walletconnect') {
        const injected = getInjected();
        if (injected) {
          try { return await connectInjectedOnce(); }
          catch (err: any) { if (opts?.prefer === 'metamask') throw err; }
        }
      }
      if (opts?.prefer === 'walletconnect' || (!getInjected() && WC_PROJECT_ID)) {
        const wc = await getWalletConnectProvider();
        const accounts: string[] = await wc.request({ method: 'eth_requestAccounts' });
        const cid = await wc.request({ method: 'eth_chainId' }).catch(async () => {
          const id = await wc.request({ method: 'eth_chainId' });
          return typeof id === 'number' ? '0x' + id.toString(16) : String(id);
        });
        return { provider: wc, accounts, chainId: cid };
      }
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
  let chainId: string = await provider.request({ method: 'eth_chainId' });
  if (typeof chainId === 'number') chainId = '0x' + chainId.toString(16);
  if (chainId?.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (err: any) {
    if (err && (err.code === 4902 || String(err.message || '').includes('Unrecognized chain'))) {
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
      return;
    }
    throw err;
  }
}

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
