/* eslint-disable @typescript-eslint/no-explicit-any */
// WalletConnect v2 з глибоким посиланням у MetaMask Mobile + авто-перемикання на BSC.
// Головний принцип: якщо ми вже всередині MetaMask (інʼєктований провайдер) — НІЧОГО не чіпаємо.
// Якщо ми у зовнішньому мобільному браузері — піднімаємо WalletConnect і відкриваємо MetaMask через deeplink.

import EthereumProvider from '@walletconnect/ethereum-provider';

const WC_PID = import.meta.env.VITE_WC_PROJECT_ID as string; // обов'язково в env
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // 0x38 = 56
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

let _provider: any | null = null;
let _ready = false;

const UA = () => (typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '');
const isMobileUA = () => /Android|iPhone|iPad|iPod/i.test(UA());
const hasInjectedMM = () => typeof window !== 'undefined' && !!(window as any).ethereum?.isMetaMask;
const isMetaMaskInApp = () => /MetaMaskMobile/i.test(UA()) || (hasInjectedMM() && /MetaMask/i.test(UA()));

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
      } else { throw e; }
    }
  } catch {
    // не валимо потік — користувач зможе перемкнути вручну
  }
}

/** Повертає робочий провайдер для мобільного середовища. */
export async function ensureMobileWalletProvider(): Promise<any> {
  if (!isMobileUA()) return (window as any)?.ethereum;

  // ✅ Вже всередині MetaMask in-app → користуємось інʼєкованим
  const injected = (window as any).ethereum;
  if (isMetaMaskInApp() && injected?.isMetaMask) {
    await ensureSwitchToBSC(injected);
    return injected;
  }

  // ✅ Зовнішній мобільний браузер → WalletConnect + deeplink у MetaMask
  if (_ready && _provider) return _provider;
  if (!WC_PID) throw new Error('VITE_WC_PROJECT_ID is missing');

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
    events: ['accountsChanged','chainChanged','disconnect','session_event','display_uri'],
    rpcMap: { [CHAIN_ID_DEC]: 'https://bsc-dataseed.binance.org/' },
    metadata: {
      name: 'Buy My Behavior',
      description: 'BMB dapp',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/favicon.ico'],
    },
    qrModalOptions: { desktopLinks: ['metamask'], mobileLinks: ['metamask'], preferDesktop: false },
  }) as any;

  // Отримуємо URI — миттєво відкриваємо MetaMask
  p.on?.('display_uri', (uri: string) => {
    const link = `metamask://wc?uri=${encodeURIComponent(uri)}`;
    try { window.location.href = link; } catch {}
    setTimeout(() => { try { window.open(link, '_blank'); } catch {} }, 300);
  });

  try { await p.connect(); } catch { /* deeplink уже міг поїхати — ок */ }

  // Для твоєї існуючої логіки, якій потрібен window.ethereum: підставляємо, лише якщо його НЕМА
  if (!(window as any).ethereum) (window as any).ethereum = p;

  try { await p.request({ method: 'eth_requestAccounts' }); } catch {}
  await ensureSwitchToBSC(p);

  p.on?.('disconnect', () => { _ready = false; _provider = null; });
  _provider = p; _ready = true;
  return p;
}
