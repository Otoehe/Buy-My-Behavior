// src/lib/walletMobileWC.ts
// WalletConnect v2 з глибоким посиланням у MetaMask Mobile + авто‑перемикання на BSC

import EthereumProvider from '@walletconnect/ethereum-provider';

const WC_PID = import.meta.env.VITE_WC_PROJECT_ID as string;   // обов'язково заповнено у Vercel
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // 0x38 = 56
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

let _provider: any | null = null;
let _ready = false;

/** Додатковий helper: перевіряє, чи ми на мобільному. */
function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function ensureWindowEthereum(p: any) {
  // робимо WC провайдер основним, щоб увесь app користувався ним
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
    // ігноруємо — користувач ще може сам перемкнути
  }
}

/**
 * Головна функція: ініціалізує WalletConnect і
 * відкриває MetaMask Mobile через deeplink, без QR та вибору браузера.
 */
export async function ensureMobileWalletProvider(): Promise<any> {
  // Якщо провайдер уже кешований та готовий — повертаємо його
  if (_ready && _provider) return _provider;

  // ✅ Новий крок: використати вже інʼєктований провайдер, якщо він є (MetaMask чи WalletConnect).
  if (typeof window !== 'undefined') {
    const injected: any = (window as any).ethereum;
    if (injected) {
      // Зберігаємо та використовуємо існуючий провайдер
      _provider = injected;
      _ready = true;

      // Переключаємо мережу на BSC, якщо треба
      try {
        await ensureSwitchToBSC(injected);
      } catch {/* ігноруємо */}

      // Ставимо слухачі для можливих змін акаунтів або мережі
      injected.on?.('accountsChanged', () => {});
      injected.on?.('chainChanged', () => {});
      injected.on?.('disconnect', () => { _ready = false; _provider = null; });

      return injected;
    }
  }

  // Без projectId WalletConnect не спрацює
  if (!WC_PID) throw new Error('VITE_WC_PROJECT_ID is missing');

  // 1) Створюємо WC-провайдер
  const p: any = await EthereumProvider.init({
    projectId: WC_PID,
    showQrModal: false,                  // без модалки
    chains: [CHAIN_ID_DEC],
    optionalChains: [CHAIN_ID_DEC],
    methods: [
      'eth_chainId','eth_accounts','eth_requestAccounts',
      'wallet_switchEthereumChain','wallet_addEthereumChain',
      'eth_sendTransaction','eth_sign','personal_sign',
      'eth_signTypedData','eth_signTypedData_v4'
    ],
    events: ['accountsChanged','chainChanged','disconnect'],
    // ключове — підказуємо WC відкривати саме MetaMask
    metadata: {
      name: 'Buy My Behavior',
      description: 'BMB dapp',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://www.buymybehavior.com',
      icons: ['https://www.buymybehavior.com/favicon.ico'],
    },
    // Працює як для мобільних (deeplink), так і для десктопних клієнтів
    qrModalOptions: {
      desktopLinks: ['metamask'],
      mobileLinks: ['metamask'],
      preferDesktop: false,
    },
  });

  // 2) З’єднання (на мобільному це викличе metamask://wc?uri=...)
  try {
    await p.connect();
  } catch {
    // інколи connect кидає, але deeplink вже відправлено — продовжуємо
  }

  // 3) Робимо його глобальним провайдером
  ensureWindowEthereum(p);

  // 4) Підстрахуємось та попросимо акаунт (це “розбудить” MM, якщо він не відкрився)
  try {
    await p.request({ method: 'eth_requestAccounts' });
  } catch {
    // на деяких прошивках MetaMask відповість після повернення у dapp — ок
  }

  // 5) Перемикаємо на BSC
  await ensureSwitchToBSC(p);

  // 6) слухачі — якщо користувач перемкне акаунт/мережу
  p.on?.('accountsChanged', () => {});
  p.on?.('chainChanged', () => {});
  p.on?.('disconnect', () => { _ready = false; _provider = null; });

  _provider = p;
  _ready = true;
  return p;
}
