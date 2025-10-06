/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "ethers";

/* ─────────── Типи ─────────── */
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

export type ConnectResult = {
  provider: Eip1193Provider;
  accounts: string[];
  chainId: string;
  ethersProvider: ethers.providers.Web3Provider;
  signer: ethers.Signer;
  address: string;
};

/* ─────────── ENV ─────────── */
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? "56";
const CHAIN_ID_HEX =
  (import.meta.env.VITE_CHAIN_ID_HEX as string) ??
  ("0x" + Number(RAW_CHAIN_ID).toString(16));
const BSC_RPC = (import.meta.env.VITE_BSC_RPC as string) || "https://bsc-dataseed.binance.org";

const APP_NAME = (import.meta.env.VITE_APP_NAME as string) || "Buy My Behavior";
const APP_URL =
  (import.meta.env.VITE_PUBLIC_APP_URL as string) ||
  (typeof window !== "undefined" ? window.location.origin : "https://www.buymybehavior.com");

let connectInFlight: Promise<ConnectResult> | null = null;
let globalMMSDK: any | null = null;

/* ─────────── Утиліти ─────────── */
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function waitForReturn(ms = 1200) { await delay(ms); }

function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}
function isMetaMaskInApp(): boolean {
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

function assertProvider(p: any): asserts p is Eip1193Provider {
  if (!p || typeof p.request !== "function") {
    throw new Error("Гаманець не готовий. Відкрийте MetaMask, поверніться у браузер і спробуйте ще раз.");
  }
}

/** один одночасний запит на метод */
const inflight = new Map<string, Promise<any>>();
async function requestOnce<T = any>(
  provider: Eip1193Provider,
  args: { method: string; params?: any[] | Record<string, any> },
  key?: string
): Promise<T> {
  assertProvider(provider);
  const k = key ?? args.method;
  if (!inflight.has(k)) {
    inflight.set(k, (async () => {
      try { return await provider.request(args); }
      finally { setTimeout(() => inflight.delete(k), 300); }
    })());
  }
  return inflight.get(k)!;
}

/* ─────────── Підключення через MetaMask SDK (зовнішній мобільний браузер) ─────────── */
async function connectViaMetaMaskSDK(): Promise<ConnectResult> {
  const { default: MetaMaskSDK } = await import("@metamask/sdk");

  if (!globalMMSDK) {
    // головне: не примушуємо deeplink до MetaMask, доки не буде UI-запиту
    globalMMSDK = new MetaMaskSDK({
      dappMetadata: { name: APP_NAME, url: APP_URL },
      useDeeplink: false,           // <- критично для “Return to app”
      shouldShimWeb3: true,         // додає window.ethereum
      checkInstallationImmediately: false,
      enableAnalytics: false,
      logging: { developerMode: false },
    });
  }

  // Ініціалізація провайдера
  let provider = globalMMSDK.getProvider() as Eip1193Provider | null;
  if (!provider || typeof (provider as any).request !== "function") {
    await delay(80);
    provider = globalMMSDK.getProvider() as Eip1193Provider | null;
  }
  assertProvider(provider);

  (globalThis as any).ethereum = provider; // щоб ethers бачив його

  // 1) читаємо акаунти без UI; якщо порожньо — просимо підключення (тоді MetaMask сам відкриється)
  let accounts: string[] = [];
  try { accounts = await requestOnce<string[]>(provider, { method: "eth_accounts" }); } catch {}
  if (!accounts || accounts.length === 0) {
    accounts = await requestOnce<string[]>(provider, { method: "eth_requestAccounts" }, "sdk_requestAccounts");
  }

  // 2) chainId
  let chainId: any = await requestOnce(provider, { method: "eth_chainId" }, "sdk_chainId");
  if (typeof chainId === "number") chainId = "0x" + chainId.toString(16);

  // 3) ethers
  const ethersProvider = new ethers.providers.Web3Provider(provider as any, "any");
  const signer = ethersProvider.getSigner();
  const address = (accounts && accounts[0]) ? accounts[0] : await signer.getAddress();

  return { provider, accounts, chainId: String(chainId), ethersProvider, signer, address };
}

/* ─────────── Інжектований провайдер (десктоп або MetaMask in-app browser) ─────────── */
async function connectInjected(): Promise<ConnectResult> {
  const provider = getInjected();
  assertProvider(provider);

  let accounts: string[] = [];
  try { accounts = await requestOnce<string[]>(provider, { method: "eth_accounts" }); } catch {}
  if (!accounts || accounts.length === 0) {
    accounts = await requestOnce<string[]>(provider, { method: "eth_requestAccounts" });
  }
  let chainId: any = await requestOnce(provider, { method: "eth_chainId" });
  if (typeof chainId === "number") chainId = "0x" + chainId.toString(16);

  const ethersProvider = new ethers.providers.Web3Provider(provider as any, "any");
  const signer = ethersProvider.getSigner();
  const address = (accounts && accounts[0]) ? accounts[0] : await signer.getAddress();

  return { provider, accounts, chainId: String(chainId), ethersProvider, signer, address };
}

/* ─────────── Публічний конектор ─────────── */
export async function connectWallet(): Promise<ConnectResult> {
  if (!connectInFlight) {
    connectInFlight = (async () => {
      // 1) якщо ми у вбудованому браузері MetaMask → інжектований
      if (isMetaMaskInApp()) return await connectInjected();

      // 2) десктоп з інжектом → інжектований
      const injected = getInjected();
      if (injected && !isMobileUA()) return await connectInjected();

      // 3) мобільний зовнішній браузер → SDK (без примусового deeplink)
      if (isMobileUA()) return await connectViaMetaMaskSDK();

      throw new Error("NO_WALLET_AVAILABLE");
    })().finally(() => setTimeout(() => { connectInFlight = null; }, 400));
  }
  return connectInFlight;
}

/* ─────────── Мережа ─────────── */
export async function ensureBSC(provider?: Eip1193Provider): Promise<void> {
  let p = provider ?? getInjected();
  if (!p && globalMMSDK) p = globalMMSDK.getProvider();
  assertProvider(p);

  let chainId: any = await requestOnce(p, { method: "eth_chainId" });
  if (typeof chainId === "number") chainId = "0x" + chainId.toString(16);
  if (String(chainId).toLowerCase() === String(CHAIN_ID_HEX).toLowerCase()) return;

  try {
    await requestOnce(
      p,
      { method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] },
      "wallet_switchEthereumChain"
    );
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (err?.code === 4902 || /Unrecognized chain|not added/i.test(msg)) {
      await requestOnce(
        p,
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

/* ─────────── Дрібні хелпери ─────────── */
export async function getChainId(provider: Eip1193Provider): Promise<string> {
  assertProvider(provider);
  const id = await requestOnce<any>(provider, { method: "eth_chainId" });
  return typeof id === "number" ? "0x" + id.toString(16) : String(id);
}
export async function getAccounts(provider: Eip1193Provider): Promise<string[]> {
  assertProvider(provider);
  return requestOnce(provider, { method: "eth_accounts" });
}
export function hasInjectedMetaMask(): boolean {
  const p = getInjected();
  return Boolean(p && (p as any).isMetaMask);
}
