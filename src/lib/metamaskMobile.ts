// src/lib/metamaskMobile.ts
let sdkInitPromise: Promise<void> | null = null;

const isMobileUA = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
const hasInjectedEthereum = () => {
  const eth = (window as any).ethereum;
  return !!eth && (eth.isMetaMask || typeof eth.request === 'function');
};

export async function ensureMobileMetaMask() {
  if (!isMobileUA() || hasInjectedEthereum()) return;

  if (!sdkInitPromise) {
    sdkInitPromise = (async () => {
      const { default: MetaMaskSDK } = await import('@metamask/sdk');

      const sdk = new MetaMaskSDK({
        injectProvider: true,
        preferDesktop: false, // обов’язково для мобіли
        communicationLayerPreference: 'webrtc',
        checkInstallationImmediately: false,
        dappMetadata: { name: 'Buy My Behavior', url: window.location.origin },
        storage: localStorage,
        useDeeplink: true,      // відкриває MetaMask app і повертає назад
        modals: { install: false },
      });

      // зробить window.ethereum
      sdk.getProvider();
    })();
  }
  await sdkInitPromise;
}

/** невеликий таймаут-помічник */
export async function withTimeout<T>(p: Promise<T>, ms = 12000, label = 'op'): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout:${label}`)), ms)) as any,
  ]);
}

/** гарантований конект + перемикання на BSC */
export async function connectAndEnsureBsc() {
  const eth = (window as any).ethereum;
  // 1) конект — обов’язково в жесті кліку
  try { await withTimeout(eth.request({ method: 'eth_requestAccounts' }), 15000, 'connect'); }
  catch { try { await eth.request({ method: 'eth_accounts' }); } catch {} }

  // 2) перемикаємо мережу (додамо, якщо нема)
  try {
    await withTimeout(eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] }), 12000, 'switch');
  } catch (err: any) {
    if (err?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x38',
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com'],
        }],
      });
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
    } else {
      throw err;
    }
  }
}
