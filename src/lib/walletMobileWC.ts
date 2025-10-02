// src/lib/walletMobileWC.ts
// WalletConnect v2 з глибоким посиланням у MetaMask Mobile + авто-перемикання на BSC

/* eslint-disable @typescript-eslint/no-explicit-any */
import EthereumProvider from '@walletconnect/ethereum-provider';

const WC_PID = import.meta.env.VITE_WC_PROJECT_ID as string;   // обов'язково заповнено
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // 0x38 = 56
export const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
export const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

let _provider: any | null = null;
let _ready = false;

function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function ensureWindowEthereum(p: any) {
  if (typeof window !== 'undefined') {
    (window as any).ethereum = p;
  }
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
  } catch {
    // ігноруємо — юзер може сам перемкнути
  }
}

/**
 *  Ініціалізує WalletConnect і відкриває MetaMask Mobile через deeplink (без QR).
 *  Після конекту робить провайдер глобальним window.ethereum.
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

  // 2) Deeplink у MetaMask при генерації URI (критично для мобільного браузера)
  p.on?.('display_uri', (uri: string) => {
    if (!isMobileUA()) return;
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = link; } catch {}
    setTimeout(() => { try { window.open(link, '_blank'); } catch {} }, 400);
  });

  // 3) Встановлюємо сесію (на мобільному це викличе metamask://wc?uri=...)
  try {
    await p.connect();
  } catch {
    // інколи connect кидає, але deeplink вже відправлено — продовжуємо
  }

  // 4) Робимо його глобальним провайдером
  ensureWindowEthereum(p);

  // 5) Запросимо акаунти (розбудить MM, якщо треба)
  try {
    await p.request({ method: 'eth_requestAccounts' });
  } catch {}

  // 6) Перемикаємо на BSC
  await ensureSwitchToBSC(p);

  // 7) Слухачі
  p.on?.('disconnect', () => { _ready = false; _provider = null; });

  _provider = p;
  _ready = true;
  return p;
}
