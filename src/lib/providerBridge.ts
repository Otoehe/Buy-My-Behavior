// lib/providerBridge.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import EthereumProvider from '@walletconnect/ethereum-provider';

const BSC_CHAIN_ID_HEX = '0x38'; // 56
const BSC_PARAMS = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.binance.org/'],
  blockExplorerUrls: ['https://bscscan.com'],
};

const PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'YOUR_WC_PROJECT_ID'; // <- заміни

// ───────────────────────────────────────────────────────────────────────────────
// Відкрити MetaMask через deeplink (Android/iOS). Якщо схема не перехопилась,
// робимо fallback на app.link.
// ───────────────────────────────────────────────────────────────────────────────
export function openMetaMaskDeepLink(wcUri: string) {
  const enc = encodeURIComponent(wcUri);
  const a = document.createElement('a');
  a.href = `metamask://wc?uri=${enc}`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Якщо вкладка не стала не-visible (тобто MM не відкрився) — пробуємо app.link
  setTimeout(() => {
    if (document.visibilityState === 'visible') {
      window.location.href = `https://metamask.app.link/wc?uri=${enc}`;
    }
  }, 800);
}

// ───────────────────────────────────────────────────────────────────────────────
// Дочекатися повернення у вкладку (Return to app). Працює і коли ОС «заморозила»
// вкладку: ставимо таймаут, щоб не зависати вічно.
// ───────────────────────────────────────────────────────────────────────────────
let returnWaiter: Promise<void> | null = null;

export function waitForReturn(timeoutMs = 15000) {
  if (document.visibilityState === 'visible') return Promise.resolve();
  if (returnWaiter) return returnWaiter;

  returnWaiter = new Promise<void>((resolve) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') done();
    };
    const t = setTimeout(done, timeoutMs);
    const cleanup = () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
      returnWaiter = null;
    };
    document.addEventListener('visibilitychange', onVis);
  });

  return returnWaiter;
}

// ───────────────────────────────────────────────────────────────────────────────
// Перемкнутися/додати BSC
// ───────────────────────────────────────────────────────────────────────────────
export async function ensureBSC(eth?: any) {
  const e = eth || (window as any).ethereum;
  if (!e) throw new Error('Ethereum provider is not available');

  try {
    const chainId = await e.request({ method: 'eth_chainId' });
    if (chainId?.toLowerCase() === BSC_CHAIN_ID_HEX) return;
  } catch {}

  try {
    await e.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_ID_HEX }] });
  } catch (err: any) {
    // 4902 — мережа не додана
    if (err?.code === 4902 || /unrecognized chain/i.test(err?.message || '')) {
      await e.request({ method: 'wallet_addEthereumChain', params: [BSC_PARAMS] });
    } else {
      throw err;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Підключення гаманця.
// 1) Якщо є window.ethereum (MetaMask / in-app MM browser) → напряму.
// 2) Інакше WalletConnect v2 як EIP-1193 провайдер (без QR, через deeplink).
//    На подію display_uri відкриваємо MetaMask.
// Повертаємо { provider } — EIP-1193.
// ───────────────────────────────────────────────────────────────────────────────
export async function connectWallet(): Promise<{ provider: any }> {
  const w = window as any;
  const hasMetaMask = !!w.ethereum && (w.ethereum.isMetaMask || Array.isArray(w.ethereum?.providers));

  if (hasMetaMask) {
    // MM вбудований (desktop або MM Browser). Просто конектимось.
    const eth = w.ethereum.providers?.find((p: any) => p.isMetaMask) || w.ethereum;
    await eth.request({ method: 'eth_requestAccounts' });
    return { provider: eth };
  }

  // WalletConnect v2 → EIP-1193 provider
  const provider = await EthereumProvider.init({
    projectId: PROJECT_ID,
    chains: [56],
    showQrModal: false, // ми не показуємо QR, відкриваємо MM через deeplink
    methods: [
      'eth_requestAccounts',
      'eth_accounts',
      'eth_sendTransaction',
      'eth_signTypedData',
      'eth_sign',
      'personal_sign',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
    ],
    events: ['chainChanged', 'accountsChanged'],
    metadata: {
      name: 'Buy My Behavior',
      description: 'Escrow',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/icon.png'],
    },
  });

  // Коли WalletConnect віддав URI, відкриваємо MetaMask
  provider.on('display_uri', (uri: string) => {
    openMetaMaskDeepLink(uri);
  });

  // Це тригерне підключення (MetaMask покаже "Connect")
  await provider.enable();

  return { provider };
}
