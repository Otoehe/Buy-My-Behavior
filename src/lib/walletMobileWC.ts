// src/lib/walletMobileWC.ts
// WalletConnect v2 з глибоким посиланням у MetaMask Mobile + авто-перемикання на BSC

import EthereumProvider from '@walletconnect/ethereum-provider';

const WC_PID = import.meta.env.VITE_WC_PROJECT_ID as string;   // обов'язково
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // 0x38 = 56
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

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
  } catch { /* ігноруємо */ }
}

/** Основна функція: ініціалізує WalletConnect і відкриває MetaMask Mobile через deeplink */
export async function ensureMobileWalletProvider(): Promise<any> {
  if (_ready && _provider) return _provider;

  // Якщо вже є інʼєктований провайдер (MM або WC) — використовуємо його
  const injected = (typeof window !== 'undefined' ? (window as any).ethereum : null);
  if (injected) {
    try { await injected.request?.({ method: 'eth_accounts' }); } catch {}
    ensureWindowEthereum(injected);
    await ensureSwitchToBSC(injected);
    injected.on?.('accountsChanged', () => {});
    injected.on?.('chainChanged', () => {});
    injected.on?.('disconnect', () => { _ready = false; _provider = null; });
    _provider = injected;
    _ready = true;
    return injected;
  }

  if (!WC_PID) throw new Error('VITE_WC_PROJECT_ID is missing');

  // 1) WC-провайдер без QR-модалки, з підказкою "metamask"
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
    events: ['accountsChanged','chainChanged','disconnect'],
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

  // 2) Конект (на мобілі це тригерить metamask://wc?uri=...)
  try { await p.connect(); } catch { /* deeplink уже міг відправитись */ }

  // 3) Робимо глобальним провайдером
  ensureWindowEthereum(p);

  // 4) Попросимо акаунти (розбуджує MM)
  try { await p.request({ method: 'eth_requestAccounts' }); } catch {}

  // 5) Перемикаємо мережу
  await ensureSwitchToBSC(p);

  // 6) Слухачі
  p.on?.('accountsChanged', () => {});
  p.on?.('chainChanged', () => {});
  p.on?.('disconnect', () => { _ready = false; _provider = null; });

  _provider = p;
  _ready = true;
  return p;
}
