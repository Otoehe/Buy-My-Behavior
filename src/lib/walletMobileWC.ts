// src/lib/walletMobileWC.ts
// WalletConnect v2 → MetaMask Mobile (deeplink) із надійним дотиском конекту після повернення з MetaMask.
/* eslint-disable @typescript-eslint/no-explicit-any */

import EthereumProvider from '@walletconnect/ethereum-provider';

const WC_PID = import.meta.env.VITE_WC_PROJECT_ID as string;
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // BSC mainnet
export const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x')
  ? RAW_CHAIN_ID
  : ('0x' + Number(RAW_CHAIN_ID).toString(16));
export const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

let _provider: any | null = null;
let _ready = false;

const isMobileUA = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

function setWindowEthereum(p: any) {
  if (typeof window !== 'undefined') (window as any).ethereum = p;
}

async function ensureSwitchToBSC(eth: any) {
  try {
    const curr = await eth.request({ method: 'eth_chainId' }).catch(() => null);
    if ((curr as string)?.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;

    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (e: any) {
      if (e?.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: CHAIN_ID_HEX,
            chainName: 'Binance Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: ['https://bsc-dataseed.binance.org/'],
            blockExplorerUrls: ['https://bscscan.com'],
          }],
        });
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
      } else {
        throw e;
      }
    }
  } catch {/* ignore */}
}

// чекаємо повернення у вкладку після оверлею "Return to app"
function waitUntilVisible(timeoutMs = 25000): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') return Promise.resolve();
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
    document.addEventListener('visibilitychange', onVis);
  });
}

// чекаємо на акаунти (агресивний пулінг + резерв через події)
async function waitForAccounts(eth: any, totalMs = 45000): Promise<string[]> {
  const start = Date.now();

  const fromEvent = new Promise<string[] | null>(resolve => {
    const h = (accs: string[]) => {
      eth.removeListener?.('accountsChanged', h);
      resolve(accs);
    };
    eth.on?.('accountsChanged', h);
    setTimeout(() => {
      eth.removeListener?.('accountsChanged', h);
      resolve(null);
    }, 6000);
  });

  while (Date.now() - start < totalMs) {
    try {
      // 1) деякі збірки віддають акаунти саме через enable()
      const viaEnable = await eth.enable?.().catch(() => undefined);
      if (Array.isArray(viaEnable) && viaEnable.length) return viaEnable;
    } catch {}

    try {
      const accs = await eth.request({ method: 'eth_requestAccounts' });
      if (Array.isArray(accs) && accs.length) return accs as string[];
    } catch {}

    try {
      const accs2 = await eth.request({ method: 'eth_accounts' });
      if (Array.isArray(accs2) && accs2.length) return accs2 as string[];
    } catch {}

    const ev = await Promise.race([
      fromEvent,
      new Promise<null>(r => setTimeout(() => r(null), 900)),
    ]);
    if (Array.isArray(ev) && ev.length) return ev;

    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Wallet did not return accounts in time');
}

/**
 * Основна функція: ініціалізація WC, deeplink у MetaMask, коректне завершення handshake, перемикання на BSC.
 */
export async function ensureMobileWalletProvider(): Promise<any> {
  if (_ready && _provider) return _provider;
  if (!WC_PID) throw new Error('VITE_WC_PROJECT_ID is missing');

  // 1) Ініт провайдера
  const p: any = await EthereumProvider.init({
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
    events: ['display_uri','connect','session_event','accountsChanged','chainChanged','disconnect'],
    rpcMap: { [CHAIN_ID_DEC]: 'https://bsc-dataseed.binance.org/' },
    metadata: {
      name: 'Buy My Behavior',
      description: 'BMB dapp',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/favicon.ico'],
    },
    qrModalOptions: { desktopLinks: ['metamask'], mobileLinks: ['metamask'], preferDesktop: false },
  });

  // 2) Deeplink → MetaMask
  p.on?.('display_uri', (uri: string) => {
    if (!isMobileUA()) return;
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = link; } catch {}
  });

  // 3) Pairing (усередині MetaMask ви натискаєте "Connect")
  await p.connect();

  // 4) Повернулися у браузер → дотискаємо конект
  setWindowEthereum(p);
  try { await waitUntilVisible(25000); } catch {}

  let accounts: string[] = [];
  try {
    accounts = await waitForAccounts(p, 45000);
  } catch {
    // fallback: відкрити ваш сайт у вбудованому браузері MetaMask (інʼєктований provider гарантовано)
    if (isMobileUA()) {
      const clean = window.location.href.replace(/^https?:\/\//, '');
      const dapp = encodeURIComponent(clean);
      try { window.location.href = `https://metamask.app.link/dapp/${dapp}`; } catch {}
    }
    throw new Error('MetaMask did not return accounts. Opened fallback.');
  }

  // 5) Перемикання на BSC
  await ensureSwitchToBSC(p);

  p.on?.('disconnect', () => { _ready = false; _provider = null; });

  _provider = p;
  _ready = true;
  return p;
}
