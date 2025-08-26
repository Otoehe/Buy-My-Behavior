// src/lib/wallet.ts
import EthereumProvider from "@walletconnect/ethereum-provider";

export type Eip1193Provider = any;

let wcProvider: Eip1193Provider | null = null;
let connectedBy: "injected" | "walletconnect" | null = null;

const BSC_CHAIN_ID = Number(import.meta.env.VITE_BSC_CHAIN_ID || 56);
const BSC_PARAMS = {
  chainId: `0x${BSC_CHAIN_ID.toString(16)}`,
  chainName: "Binance Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: [import.meta.env.VITE_BSC_RPC || "https://bsc-dataseed.binance.org"],
  blockExplorerUrls: ["https://bscscan.com"],
};

export function hasInjected(): boolean {
  return typeof window !== "undefined" && !!(window as any).ethereum;
}

export async function getWalletConnectProvider(): Promise<Eip1193Provider> {
  if (wcProvider) return wcProvider;

  const projectId = import.meta.env.VITE_WC_PROJECT_ID;
  if (!projectId) throw new Error("VITE_WC_PROJECT_ID is missing in .env");

  wcProvider = await EthereumProvider.init({
    projectId,
    chains: [BSC_CHAIN_ID],
    showQrModal: true,
    rpcMap: { [BSC_CHAIN_ID]: import.meta.env.VITE_BSC_RPC || "https://bsc-dataseed.binance.org" },
    optionalChains: [BSC_CHAIN_ID],
    metadata: {
      name: "Buy My Behavior",
      description: "BMB DApp",
      url: typeof window !== "undefined" ? window.location.origin : "https://bmb.app",
      icons: ["https://fav.farm/🅱️"],
    },
  });

  try { await wcProvider.enable(); } catch {}
  return wcProvider!;
}

export async function ensureBSC(provider: Eip1193Provider) {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_PARAMS.chainId }] });
  } catch (err: any) {
    if (err?.code === 4902 || /Unrecognized chain ID/i.test(String(err?.message))) {
      await provider.request({ method: "wallet_addEthereumChain", params: [BSC_PARAMS] });
    } else {
      throw err;
    }
  }
}

export async function connectWallet(): Promise<Eip1193Provider> {
  if (hasInjected()) {
    const inj = (window as any).ethereum;
    const accounts: string[] = await inj.request({ method: "eth_requestAccounts" });
    if (!accounts?.length) throw new Error("Гаманець не підключено");
    await ensureBSC(inj);
    connectedBy = "injected";
    return inj;
  }
  const wc = await getWalletConnectProvider();
  const accounts: string[] = await wc.request({ method: "eth_requestAccounts" });
  if (!accounts?.length) throw new Error("Гаманець не підключено");
  await ensureBSC(wc);
  connectedBy = "walletconnect";
  return wc;
}

export function currentConnector(): "injected" | "walletconnect" | null {
  return connectedBy;
}

export async function disconnectWallet() {
  if (connectedBy === "walletconnect" && wcProvider) {
    try { await wcProvider.disconnect(); } catch {}
    wcProvider = null;
  }
  connectedBy = null;
}

export async function getAccounts(provider: Eip1193Provider): Promise<string[]> {
  try {
    const accs: string[] = await provider.request({ method: "eth_accounts" });
    return accs || [];
  } catch { return []; }
}

// ЯВНИЙ ре-експорт (на випадок дивних кешів Vite)
export { connectWallet as _connectWalletCheck, ensureBSC as _ensureBSCCheck };
