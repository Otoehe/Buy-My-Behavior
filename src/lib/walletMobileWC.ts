// src/lib/walletMobileWC.ts
import EthereumProvider from '@walletconnect/ethereum-provider';

const isMobileUA = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
let wcProvider: any | null = null;

/**
 * Підіймає WalletConnect провайдер для мобіли і
 * АВТОМАТИЧНО відкриває MetaMask через metamask://wc?uri=...
 * Після конекту виставляє window.ethereum = wcProvider,
 * щоб твоя поточна логіка (ethers/contract) працювала як є.
 */
export async function ensureMobileWalletProvider() {
  if (!isMobileUA()) return;

  if (!wcProvider) {
    wcProvider = await EthereumProvider.init({
      projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID!,
      chains: [56], // BSC mainnet
      showQrModal: false, // нам не потрібен QR на мобілці
      methods: [
        'eth_sendTransaction',
        'eth_signTransaction',
        'eth_sign',
        'personal_sign',
        'eth_signTypedData',
        'wallet_switchEthereumChain',
        'wallet_addEthereumChain',
        'eth_requestAccounts',
      ],
      events: ['chainChanged', 'accountsChanged', 'connect', 'disconnect'],
      metadata: {
        name: 'Buy My Behavior',
        description: 'BMB dApp',
        url: window.location.origin,
        icons: [window.location.origin + '/favicon.ico'],
      },
    });

    // коли з’являється URI — відкриваємо MetaMask нативним deep-link
    wcProvider.on('display_uri', (uri: string) => {
      // Це відкриє САМЕ MetaMask, без системного вибору браузера
      const deeplink = `metamask://wc?uri=${encodeURIComponent(uri)}`;
      window.location.href = deeplink;
    });

    // коли конект відбувся — прокидаємо ethereum у глобал
    wcProvider.on('connect', () => {
      (window as any).ethereum = wcProvider;
    });

    wcProvider.on('disconnect', () => {
      // за бажанням можна очистити провайдера
      // wcProvider = null;
    });
  }

  // Якщо ще не підключені — ініціюємо конект (це викличе display_uri → відкриє MetaMask)
  if (!wcProvider?.session || !wcProvider.session.connected) {
    await wcProvider.connect();
  }

  // після конекту точно є window.ethereum
  (window as any).ethereum = wcProvider;

  // гарантуємо ланцюг 0x38 (BSC)
  try {
    await wcProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x38' }],
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await wcProvider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x38',
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com'],
        }],
      });
      await wcProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x38' }],
      });
    } else {
      throw err;
    }
  }
}

/** корисно на iOS/Android — дочекатися повернення у браузер */
export function waitUntilVisible(timeoutMs = 15000): Promise<void> {
  if (document.visibilityState === 'visible') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVis);
        resolve();
      }
    };
    const t = setTimeout(() => {
      document.removeEventListener('visibilitychange', onVis);
      reject(new Error('Timeout:visible'));
    }, timeoutMs);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(t);
        onVis();
      }
    });
  });
}
