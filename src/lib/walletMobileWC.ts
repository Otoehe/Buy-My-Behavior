// src/lib/walletMobileWC.ts
// WalletConnect v2 для мобільного: deeplink у MetaMask + надійний handshake після повернення
/* eslint-disable @typescript-eslint/no-explicit-any */

import EthereumProvider from '@walletconnect/ethereum-provider';

const WC_PID = import.meta.env.VITE_WC_PROJECT_ID as string;
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // BSC
export const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
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
  } catch {/* ігноруємо */}
}

// чекаємо, поки юзер повернеться у вкладку (після оверлею "Return to app")
function waitUntilVisible(timeoutMs = 20000): Promise<void> {
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
      reject(new Error('Timeout: visible'));
    }, timeoutMs);
    document.addEventListener('visibilitychange', onVis);
  });
}

// опитуємо гаманця, поки не зʼявляться акаунти
async function waitForAccounts(eth: any, timeoutMs = 30000): Promise<string[]> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const accs: string[] = await eth.request({ method: 'eth_accounts' });
      if (Array.isArray(accs) && accs.length > 0) return accs;
    } catch {}
    await new Promise(r => setTimeout(r, 700));
  }
  throw new Error('Wallet not connected (no accounts)');
}

/**
 * Головна: ініціює WalletConnect, відкриває MetaMask і коректно завершує handshake
 */
export async function ensureMobileWalletProvider(): Promise<any> {
  if (_ready && _provider) return _provider;
  if (!WC_PID) throw new Error('VITE_WC_PROJECT_ID is missing');

  // 1) Створюємо WC-провайдер
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
    events: ['display_uri','accountsChanged','chainChanged','disconnect','session_event'],
    rpcMap: { [CHAIN_ID_DEC]: 'https://bsc-dataseed.binance.org/' },
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

  // 2) Deeplink у MetaMask (Android/iOS)
  p.on?.('display_uri', (uri: string) => {
    if (!isMobileUA()) return;
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = link; } catch {}
  });

  // 3) Запускаємо pairing (поки юзер у MetaMask)
  await p.connect();

  // 4) Після повернення у ваш додаток — завершуємо handshake
  setWindowEthereum(p);
  try { await waitUntilVisible(20000); } catch {}

  try {
    // інколи MetaMask ще «прокидається» — допомагає повторний request
    try { await p.request({ method: 'eth_requestAccounts' }); } catch {}
    await waitForAccounts(p, 30000);
  } catch {
    // остання спроба
    try { await p.request({ method: 'eth_requestAccounts' }); } catch {}
    await waitForAccounts(p, 15000);
  }

  // 5) Перемикаємо на BSC
  await ensureSwitchToBSC(p);

  // 6) Слухачі
  p.on?.('disconnect', () => { _ready = false; _provider = null; });

  _provider = p;
  _ready = true;
  return p;
}
