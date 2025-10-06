/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "ethers";

export type Eip1193Request = (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
export interface Eip1193Provider {
  request: Eip1193Request;
  on?: (ev: string, cb: (...a: any[]) => void) => void;
  removeListener?: (ev: string, cb: (...a: any[]) => void) => void;
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
  isConnected?: () => boolean;
  connect?: () => Promise<void>;
  chainId?: string | number;
}

export type ConnectResult = {
  provider: Eip1193Provider;
  accounts: string[];
  chainId: string;
  ethersProvider: ethers.providers.Web3Provider;
  signer: ethers.Signer;
  address: string;
};

/* ── ENV ─────────────────────────────────────────────────────────────────── */
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? "56";
export const CHAIN_ID_HEX =
  RAW_CHAIN_ID.toString().startsWith("0x") ? RAW_CHAIN_ID.toString() : ("0x" + Number(RAW_CHAIN_ID).toString(16));

const BSC_RPC = (import.meta.env.VITE_BSC_RPC as string) || "https://bsc-dataseed.binance.org";
const APP_NAME = (import.meta.env.VITE_APP_NAME as string) || "Buy My Behavior";
const APP_URL =
  (import.meta.env.VITE_PUBLIC_APP_URL as string) ||
  (typeof window !== "undefined" ? window.location.origin : "https://buymybehavior.com");
const ENABLE_SDK = String(import.meta.env.VITE_ENABLE_METAMASK_SDK || "true") === "true";

/* ── internal single-flight ──────────────────────────────────────────────── */
let connectInFlight: Promise<ConnectResult> | null = null;
const inflight = new Map<string, Promise<any>>();
let globalMMSDK: any | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function waitForReturn(ms = 1200) { await sleep(ms); }

/* ── helpers ─────────────────────────────────────────────────────────────── */
export function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}
export function isMetaMaskInApp(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /MetaMaskMobile/i.test(ua);
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
function assertProvider(p: any): asserts p is Eip1193Provider {
  if (!p || typeof p.request !== "function") {
    throw new Error("Гаманець не готовий. Відкрийте MetaMask і повторіть.");
  }
}

async function requestOnce<T = any>(
  provider: Eip1193Provider | null | undefined,
  args: { method: string; params?: any[] | Record<string, any> },
  keyHint?: string
): Promise<T> {
  assertProvider(provider);
  const key = keyHint ?? args.method;
  if (!inflight.has(key)) {
    inflight.set(
      key,
      (async () => {
        try {
          // деякі провайдери вимагають connect() перед першим request()
          if (typeof provider!.connect === "function") {
            try {
              const connected = typeof provider!.isConnected === "function" ? provider!.isConnected() : true;
              if (!connected) await provider!.connect!();
            } catch { /* ignore */ }
          }
          return await provider!.request(args);
        } finally {
          setTimeout(() => inflight.delete(key), 300);
        }
      })()
    );
  }
  return inflight.get(key)!;
}

/* ── MetaMask SDK (mobile app-switch) ────────────────────────────────────── */
async function connectViaSDK(): Promise<ConnectResult> {
  const { default: MetaMaskSDK } = await import("@metamask/sdk");
  if (!globalMMSDK) {
    globalMMSDK = new MetaMaskSDK({
      dappMetadata: { name: APP_NAME, url: APP_URL },
      useDeeplink: true,
      shouldShimWeb3: true,
      checkInstallationImmediately: false,
      logging: { developerMode: false },
      enableAnalytics: false
    });
  }

  try { await globalMMSDK.connect?.(); } catch { /* no-op */ }

  let provider = globalMMSDK.getProvider() as Eip1193Provider | null;
  if (!provider || typeof (provider as any).request !== "function") {
    await sleep(120);
    provider = globalMMSDK.getProvider() as Eip1193Provider | null;
  }
  assertProvider(provider);

  (globalThis as any).ethereum = provider; // щоб інші бібліотеки бачили

  const accounts: string[] = await requestOnce(provider, { method: "eth_requestAccounts" }, "sdk_req_acc");
  let chainId: any = await requestOnce(provider, { method: "eth_chainId" }, "sdk_chain");
  if (typeof chainId === "number") chainId = "0x" + chainId.toString(16);

  const ethersProvider = new ethers.providers.Web3Provider(provider as any, "any");
  const signer = ethersProvider.getSigner();
  const address = accounts[0] || (await signer.getAddress());

  return { provider: provider!, accounts, chainId: String(chainId), ethersProvider, signer, address };
}

/* ── injected (desktop or MetaMask in-app browser) ──────────────────────── */
async function connectInjected(): Promise<ConnectResult> {
  const provider = getInjected();
  assertProvider(provider);

  // спроба взяти існуючі акаунти
  let accounts: string[] = [];
  try {
    accounts = await requestOnce(provider, { method: "eth_accounts" });
  } catch { /* ignore */ }
  if (!accounts || !accounts.length) {
    accounts = await requestOnce(provider, { method: "eth_requestAccounts" });
  }
  let chainId: any = await requestOnce(provider, { method: "eth_chainId" });
  if (typeof chainId === "number") chainId = "0x" + chainId.toString(16);

  const ethersProvider = new ethers.providers.Web3Provider(provider as any, "any");
  const signer = ethersProvider.getSigner();
  const address = accounts[0] || (await signer.getAddress());
  return { provider, accounts, chainId: String(chainId), ethersProvider, signer, address };
}

/* ── public: connectWallet ───────────────────────────────────────────────── */
export async function connectWallet(): Promise<ConnectResult> {
  if (!connectInFlight) {
    connectInFlight = (async () => {
      const injected = getInjected();

      // Desktop: інжектований
      if (!isMobileUA() && injected) return await connectInjected();

      // Mobile: якщо всередині браузера MetaMask – теж injected
      if (isMobileUA() && injected && isMetaMaskInApp()) return await connectInjected();

      // Mobile: зовнішній браузер → SDK
      if (isMobileUA() && ENABLE_SDK) return await connectViaSDK();

      throw new Error("NO_WALLET_AVAILABLE");
    })().finally(() => setTimeout(() => (connectInFlight = null), 400));
  }
  return connectInFlight;
}

/* ── network helpers ─────────────────────────────────────────────────────── */
export async function ensureBSC(provider?: Eip1193Provider): Promise<void> {
  const p = provider || getInjected() || (globalMMSDK?.getProvider?.() as Eip1193Provider | null);
  assertProvider(p);

  let cid: any = await requestOnce(p, { method: "eth_chainId" }, "eth_chainId");
  if (typeof cid === "number") cid = "0x" + cid.toString(16);
  if (String(cid).toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;

  try {
    await requestOnce(
      p,
      { method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] },
      "wallet_switchEthereumChain"
    );
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (err?.code === 4902 || /Unrecognized chain|not added|missing/i.test(msg)) {
      await requestOnce(
        p,
        {
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: "Binance Smart Chain",
              nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
              rpcUrls: [BSC_RPC],
              blockExplorerUrls: ["https://bscscan.com"]
            }
          ]
        },
        "wallet_addEthereumChain"
      );
      return;
    }
    throw err;
  }
}
