// src/lib/mobileWallet.ts
let _sdk: any | null = null;

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

async function waitVisible(ms = 15000) {
  if (document.visibilityState === "visible") return;
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => { document.removeEventListener("visibilitychange", on); rej(new Error("visible-timeout")); }, ms);
    const on = () => { if (document.visibilityState === "visible") { clearTimeout(t); document.removeEventListener("visibilitychange", on); res(); } };
    document.addEventListener("visibilitychange", on);
  });
}

export async function ensureMetaMaskMobileReady() {
  // Настроєне лише під MetaMask. НІЯКОГО WalletConnect.
  if (!isMobile()) return;

  const { default: MetaMaskSDK } = await import("@metamask/sdk");

  if (!_sdk) {
    _sdk = new MetaMaskSDK({
      injectProvider: true,
      preferDesktop: false,
      useDeeplink: true,                 // відкриває MetaMask app без системного “вибрати додаток”
      communicationLayerPreference: "webrtc",
      checkInstallationImmediately: false,
      storage: localStorage,
      dappMetadata: { name: "Buy My Behavior", url: window.location.origin },
    });
    _sdk.getProvider();
  }

  const eth = (window as any).ethereum;
  // Створюємо сесію app↔MetaMask
  try { await _sdk.connect(); } catch {}

  // Запит акаунтів у ЖЕСТІ КЛІКУ
  try { await eth.request({ method: "eth_requestAccounts" }); } catch {}

  // Чекаємо повернення у вкладку після відкриття MM
  try { await waitVisible(15000); } catch {}

  // Перемикаємося на BSC (56)
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
  } catch (e: any) {
    if (e?.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x38",
          chainName: "Binance Smart Chain",
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: [import.meta.env.VITE_BSC_RPC || "https://bsc-dataseed.binance.org/"],
          blockExplorerUrls: ["https://bscscan.com"],
        }],
      });
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
    } else {
      throw e;
    }
  }
}
