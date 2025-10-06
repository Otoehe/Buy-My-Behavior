/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "ethers";

// ── Типи
export type Eip1193Request = (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
export interface Eip1193Provider {
  request: Eip1193Request;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
  isConnected?: () => boolean;
  connect?: () => Promise<void>;
  session?: unknown;
  chainId?: string | number;
}

export type ConnectResult = {
  provider: Eip1193Provider;
  accounts: string[];
  chainId: string;
  address: string;
  ethersProvider: any; // ethers v5 Web3Provider або v6 BrowserProvider
  signer: any;         // ethers.Signer (v5/v6)
};

// ── ENV
const RAW_CHAIN_ID  = (import.meta.env.VITE_CHAIN_ID as string) ?? "0x38";
const CHAIN_ID_HEX  = RAW_CHAIN_ID.toString().startsWith("0x") ? RAW_CHAIN_ID : ("0x" + Number(RAW_CHAIN_ID).toString(16));
const BSC_RPC       = (import.meta.env.VITE_BSC_RPC as string) || "https://bsc-dataseed.binance.org";
const APP_NAME      = (import.meta.env.VITE_APP_NAME as string) || "Buy My Behavior";
const APP_URL       = (import.meta.env.VITE_PUBLIC_APP_URL as string)
  || (typeof window !== "undefined" ? window.location.origin : "https://www.buymybehavior.com");
const ENABLE_MMSDK  = String(import.meta.env.VITE_ENABLE_METAMASK_SDK || "true") === "true";

let connectInFlight: Promise<ConnectResult> | null = null;
const inflightByKey = new Map<string, Promise<any>>();
let globalMMSDK: any | null = null;

// ── helpers
export function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}
export function isMetaMaskInApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MetaMaskMobile/i.test(navigator.userAgent);
}
function getInjected(): Eip1193Provider | null {
  const eth = (globalThis as any).ethereum as Eip1193Provider | undefined;
  if (!eth) return null;
  if (Array.isArray((eth as any).providers) && (eth as any).providers.length) {
    const mm = (eth as any).providers.find((p: any) => p && (p.isMetaMask || typeof p.request === "function"));
    return (mm || (eth as any).providers[0]) as Eip1193Provider;
  }
  return eth as Eip1193Provider;
}
function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
export async function waitForReturn(ms = 1200) { await delay(ms); }

async function pollAccounts(provider: Eip1193Provider, timeoutMs = 30000, stepMs = 500): Promise<string[]> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const accs: string[] = await provider.request({ method: "eth_accounts" });
      if (accs?.length) return accs;
    } catch {}
    await delay(stepMs);
  }
  return [];
}

// Головний гард
function assertProvider(p: any): asserts p is Eip1193Provider {
  if (!p || typeof p.request !== "function") {
    throw new Error("Гаманець не готовий. Відкрийте MetaMask, поверніться у браузер і спробуйте ще раз.");
  }
}

async function requestWithConnect<T = any>(
  provider: Eip1193Provider | undefined | null,
  args: { method: string; params?: any[] | Record<string, any> },
  keyHint?: string
): Promise<T> {
  assertProvider(provider);
  const key = keyHint ?? args.method;

  if (!inflightByKey.has(key)) {
    inflightByKey.set(key, (async () => {
      try {
        if (args.method !== "eth_requestAccounts" && typeof provider!.connect === "function") {
          const isConn = typeof provider!.isConnected === "function" ? provider!.isConnected() : Boolean((provider as any).session);
          if (!isConn) { try { await provider!.connect!(); } catch {} }
        }
        return await provider!.request(args);
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (/connect\(\)\s*before\s*request\(\)/i.test(msg)) {
          try { await provider!.connect?.(); } catch {}
          return await provider!.request(args);
        }
        if (err?.code === -32002 || /already pending/i.test(msg)) {
          const res = await pollAccounts(provider!, 30000, 500);
          if (args.method === "eth_requestAccounts" && res.length) return res as any;
        }
        throw err;
      } finally {
        setTimeout(() => inflightByKey.delete(key), 400);
      }
    })());
  }
  return inflightByKey.get(key)!;
}

// ── перетворення EIP-1193 -> ethers (v5/v6 сумісність)
async function toEthers(eth: Eip1193Provider): Promise<{ ethersProvider: any; signer: any; address: string }> {
  const anyE = ethers as any;

  // v5
  if (anyE.providers?.Web3Provider) {
    const prov = new anyE.providers.Web3Provider(eth, "any");
    const signer = prov.getSigner();
    const address = (await prov.listAccounts())[0] ?? (await signer.getAddress?.());
    return { ethersProvider: prov, signer, address };
  }
  // v6
  const prov = new anyE.BrowserProvider(eth);
  const signer = await prov.getSigner();
  const address = await signer.getAddress();
  return { ethersProvider: prov, signer, address };
}

// ── MetaMask SDK (app-switch)
async function connectViaMetaMaskSDK(): Promise<ConnectResult> {
  const { default: MetaMaskSDK } = await import("@metamask/sdk");

  if (!globalMMSDK) {
    globalMMSDK = new MetaMaskSDK({
      dappMetadata: { name: APP_NAME, url: APP_URL },
      useDeeplink: true,
      shouldShimWeb3: true,
      checkInstallationImmediately: false,
      logging: { developerMode: false },
      enableAnalytics: false,
    });
  }

  try { await (globalMMSDK as any)?.connect?.(); } catch {}

  let provider = globalMMSDK.getProvider() as Eip1193Provider | null;
  if (!provider || typeof (provider as any).request !== "function") {
    await delay(150);
    provider = globalMMSDK.getProvider() as Eip1193Provider | null;
  }
  assertProvider(provider);

  (globalThis as any).ethereum = provider;

  const accounts: string[] = await requestWithConnect(provider, { method: "eth_requestAccounts" }, "sdk_eth_requestAccounts");
  let chainId: any = await requestWithConnect(provider, { method: "eth_chainId" }, "sdk_eth_chainId");
  if (typeof chainId === "number") chainId = "0x" + chainId.toString(16);

  const { ethersProvider, signer, address } = await toEthers(provider);
  return { provider, accounts, chainId: String(chainId), address, ethersProvider, signer };
}

// ── injected (desktop / MetaMask Browser)
async function connectInjectedOnce(): Promise<ConnectResult> {
  const provider = getInjected();
  assertProvider(provider);

  try {
    const accs: string[] = await requestWithConnect(provider, { method: "eth_accounts" });
    const chainId: string = await requestWithConnect(provider, { method: "eth_chainId" });
    if (accs?.length) {
      const { ethersProvider, signer, address } = await toEthers(provider);
      return { provider, accounts: accs, chainId, address, ethersProvider, signer };
    }
  } catch {}

  const accounts: string[] = await requestWithConnect(provider, { method: "eth_requestAccounts" });
  const chainId: string = await requestWithConnect(provider, { method: "eth_chainId" });
  const { ethersProvider, signer, address } = await toEthers(provider);
  return { provider, accounts, chainId, address, ethersProvider, signer };
}

// ── Публічний конектор
export async function connectWallet(): Promise<ConnectResult> {
  if (!connectInFlight) {
    connectInFlight = (async () => {
      const injected = getInjected();

      // Desktop: інжектований MetaMask
      if (injected && typeof (injected as any).request === "function" && !isMobileUA()) {
        return await connectInjectedOnce();
      }

      // Mobile: всередині MetaMask Browser — це теж injected
      if (injected && isMobileUA()) {
        const ua = navigator.userAgent || "";
        if (/MetaMaskMobile/i.test(ua)) return await connectInjectedOnce();
      }

      // Mobile зовнішній браузер → SDK
      if (isMobileUA() && ENABLE_MMSDK) {
        const res = await connectViaMetaMaskSDK();
        assertProvider(res.provider);
        return res;
      }

      throw new Error("NO_WALLET_AVAILABLE");
    })().finally(() => setTimeout(() => { connectInFlight = null; }, 450));
  }
  return connectInFlight;
}

// ── мережа
export async function ensureBSC(provider?: Eip1193Provider): Promise<void> {
  const eth = provider ?? getInjected();
  assertProvider(eth);

  let chainId: any = await requestWithConnect(eth, { method: "eth_chainId" });
  if (typeof chainId === "number") chainId = "0x" + chainId.toString(16);
  if (String(chainId).toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;

  try {
    await requestWithConnect(
      eth,
      { method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] },
      "wallet_switchEthereumChain"
    );
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (err?.code === 4902 || /Unrecognized chain|not added/i.test(msg)) {
      await requestWithConnect(
        eth,
        {
          method: "wallet_addEthereumChain",
          params: [{
            chainId: CHAIN_ID_HEX,
            chainName: "Binance Smart Chain",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: [BSC_RPC],
            blockExplorerUrls: ["https://bscscan.com"],
          }],
        },
        "wallet_addEthereumChain"
      );
      return;
    }
    throw err;
  }
}

// дрібні утиліти
export async function getChainId(provider: Eip1193Provider): Promise<string> {
  assertProvider(provider);
  const id = await requestWithConnect<any>(provider, { method: "eth_chainId" });
  return typeof id === "number" ? "0x" + id.toString(16) : String(id);
}
export async function getAccounts(provider: Eip1193Provider): Promise<string[]> {
  assertProvider(provider);
  return requestWithConnect(provider, { method: "eth_accounts" });
}
export function hasInjectedMetaMask(): boolean {
  const p = getInjected();
  return Boolean(p && (p as any).isMetaMask);
}

// Опціонально: форс-вмикання SDK/MetaMask-браузера
export async function ensureInMetaMaskDapp(): Promise<void> {
  if (isMobileUA() && !isMetaMaskInApp() && ENABLE_MMSDK) {
    await connectViaMetaMaskSDK(); // відкриє MetaMask і створить сесію
  }
}
