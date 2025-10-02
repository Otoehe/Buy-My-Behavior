// src/lib/walletMobileWC.ts
// WalletConnect v2 → MetaMask Mobile з обов'язковим очікуванням акаунтів

/* eslint-disable @typescript-eslint/no-explicit-any */
import EthereumProvider from '@walletconnect/ethereum-provider';

export const WC_PID = import.meta.env.VITE_WC_PROJECT_ID as string;
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // BSC mainnet (56)
export const CHAIN_ID_HEX =
  RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
export const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

let _provider: any | null = null;
let _ready = false;

function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function ensureWindowEthereum(p: any) {
  if (typeof window !== 'undefined') (window as any).ethereum = p;
}

async function ensureSwitchToBSC(eth: any) {
  try {
    const curr = await eth.request({ method: 'eth_chainId' }).catch(() => null);
    if ((curr as string)?.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;

    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (e: any) {
      if (e?.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: 'Binance Smart Chain',
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
              rpcUrls: ['https://bsc-dataseed.binance.org/'],
              blockExplorerUrls: ['https://bscscan.com'],
            },
          ],
        });
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CHAIN_ID_HEX }],
        });
      } else {
        throw e;
      }
    }
  } catch {
    // ігноруємо — юзер може сам перемкнути
  }
}

/** Чекаємо допоки зʼявиться хоча б один акаунт у провайдера */
function waitForAccounts(eth: any, timeoutMs = 30000): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (accs: string[]) => {
      if (!done) {
        done = true;
        try { eth.removeListener?.('accountsChanged', onAccs); } catch {}
        resolve(accs);
      }
    };
    const onAccs = (accs: string[]) => {
      if (Array.isArray(accs) && accs.length) finish(accs);
    };

    eth.on?.('accountsChanged', onAccs);

    // перший poll
    (async () => {
      for (let i = 0; i < 40 && !done; i++) {
        try {
          const accs = await eth.request({ method: 'eth_accounts' }).catch(() => []);
          if (Array.isArray(accs) && accs.length) return finish(accs);
        } catch {}
        await new Promise(r => setTimeout(r, 750));
      }
      if (!done) {
        try { eth.removeListener?.('accountsChanged', onAccs); } catch {}
        reject(new Error('WalletConnect connected, but no accounts'));
      }
    })();

    setTimeout(() => {
      if (!done) {
        try { eth.removeListener?.('accountsChanged', onAccs); } catch {}
        reject(new Error('Timeout waiting for accounts'));
      }
    }, timeoutMs);
  });
}

/**
 * Головна: ініціалізуємо WC-провайдер, відкриваємо MetaMask deeplink,
 * чекаємо появи accounts, робимо його window.ethereum і перемикаємо мережу.
 */
export async function ensureMobileWalletProvider(): Promise<any> {
  if (_ready && _provider) return _provider;
  if (!WC_PID) throw new Error('VITE_WC_PROJECT_ID is missing');

  // init
  const p = await EthereumProvider.init({
    projectId: WC_PID,
    showQrModal: false,
    chains: [CHAIN_ID_DEC],
    optionalChains: [CHAIN_ID_DEC],
    methods: [
      'eth_chainId','eth_accounts','eth_requestAccounts',
      'wallet_switchEthereumChain','wallet_addEthereumChain',
      'eth_sendTransaction','eth_sign','personal_sign',
      'eth_signTypedData','eth_signTypedData_v4'
    ],
    events: ['accountsChanged','chainChanged','disconnect','session_event'],
    metadata: {
      name: 'Buy My Behavior',
      description: 'BMB dapp',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/favicon.ico'],
    },
    qrModalOptions: {
      desktopLinks: ['metamask'],
      mobileLinks: ['metamask'],
      preferDesktop: false,
    },
  });

  // deeplink за сигналом від WC
  p.on?.('display_uri', (uri: string) => {
    if (!isMobileUA()) return;
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = link; } catch {}
    setTimeout(() => { try { window.open(link, '_blank'); } catch {} }, 400);
  });

  p.on?.('disconnect', () => {
    _ready = false; _provider = null;
  });

  // встановлюємо сесію (на мобільному при цьому відкриється MM)
  try { await p.connect(); } catch {}

  // робимо глобальним
  ensureWindowEthereum(p);

  // просимо акаунти (деякі прошивки вимагають 2 запити)
  try { await p.request({ method: 'eth_requestAccounts' }); } catch {}
  await waitForAccounts(p); // 👈 критично: без цього отримаємо "Return to app"

  // мережа
  await ensureSwitchToBSC(p);

  _provider = p;
  _ready = true;
  return p;
}
