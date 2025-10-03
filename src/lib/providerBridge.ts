/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * providerBridge.ts
 * Єдиний шар абстракції над провайдером:
 * - Desktop: інжектований window.ethereum (MetaMask extension / MetaMask in-app browser)
 * - Mobile: MetaMask Mobile через MetaMask SDK (deeplink)
 *
 * Експортує:
 *  - connectWallet(): Promise<{ provider: Eip1193Provider; accounts: string[] }>
 *  - ensureBSC(provider): Promise<void>  // перемикає на BSC (або додає, якщо нема)
 *  - waitForReturn(ms?): Promise<void>   // очікує повернення з MetaMask Mobile
 *  - Eip1193Provider (type)
 */

export type Eip1193RequestArgs = { method: string; params?: any[] | Record<string, any> };
export type Eip1193Provider = {
  request: (args: Eip1193RequestArgs) => Promise<any>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
};

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // 56
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

// Мінімальний набір RPC для BSC (основна мережа)
const BSC_PARAMS = {
  chainId: '0x38',
  chainName: 'Binance Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: [
    'https://bsc-dataseed.binance.org/',
    'https://bsc-dataseed1.binance.org/',
    'https://rpc.ankr.com/bsc',
  ],
  blockExplorerUrls: ['https://bscscan.com'],
} as const;

const isClient = typeof window !== 'undefined';
const getUA = () => (isClient ? navigator.userAgent : '');
const isMobileUA = () => /Android|iPhone|iPad|iPod/i.test(getUA());

// Ледаче створення SDK тільки за потреби (мобайл без інжектованого Ethereum)
let _sdkInitPromise: Promise<{ provider: Eip1193Provider }> | null = null;

/**
 * Ініціалізує MetaMask SDK і повертає провайдера для мобільних браузерів.
 * Використовує dynamic import, щоб не тягнути SDK у десктопний бандл.
 */
async function getMobileSdkProvider(): Promise<Eip1193Provider> {
  if (!isClient) throw new Error('MetaMask SDK requires a browser environment');

  if (!_sdkInitPromise) {
    _sdkInitPromise = (async () => {
      const { default: MetaMaskSDK } = await import('@metamask/sdk'); // dynamic import
      const sdk = new MetaMaskSDK({
        dappMetadata: {
          name: 'Buy My Behavior',
          url: (typeof location !== 'undefined' ? location.origin : 'https://buymybehavior.com'),
        },
        // Налаштування під мобільний deeplink-флоу
        checkInstallationImmediately: false,
        shouldShimWeb3: true,
        useDeeplink: true,
        // Швидший канал зв’язку, якщо доступний
        communicationLayerPreference: 'webrtc',
        logging: { developerMode: false },
      } as any);

      const provider = sdk.getProvider() as unknown as Eip1193Provider;

      // Підстрахуємо глобальне вікно – щоб інший код міг використовувати window.ethereum
      if (isClient && !(window as any).ethereum) {
        (window as any).ethereum = provider as any;
      }

      return { provider };
    })();
  }

  const { provider } = await _sdkInitPromise;
  return provider;
}

/**
 * Повертає актуальний провайдер залежно від середовища:
 * - MetaMask extension / in-app browser: window.ethereum
 * - Mobile external browser: MetaMask SDK
 */
async function resolveProvider(): Promise<Eip1193Provider> {
  if (!isClient) throw new Error('Provider is only available in the browser');

  const injected = (window as any).ethereum as Eip1193Provider | undefined;

  // Вбудований браузер MetaMask на мобільних ТАКОЖ інжектує window.ethereum
  if (injected && injected.request) {
    return injected;
  }

  // Якщо мобільний браузер без інжекції – піднімаємо SDK (deeplink в MetaMask app)
  if (isMobileUA()) {
    return await getMobileSdkProvider();
  }

  // Десктоп без MetaMask – коректне повідомлення
  throw new Error('MetaMask не знайдено. Встановіть розширення MetaMask або відкрийте сайт у MetaMask Mobile.');
}

/**
 * Публічний конект: гарантує, що користувач обрав акаунт.
 */
export async function connectWallet(): Promise<{ provider: Eip1193Provider; accounts: string[] }> {
  const provider = await resolveProvider();

  // Запит списку акаунтів (відкриє MetaMask при потребі)
  const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });

  // Деякі мобільні оточення повертають порожній масив одразу – коротко зачекаємо та перепитаємо
  if (!accounts || accounts.length === 0) {
    await new Promise((r) => setTimeout(r, 600));
    const retry: string[] = await provider.request({ method: 'eth_accounts' });
    if (!retry || retry.length === 0) {
      throw new Error('Не вдалось отримати акаунт з MetaMask');
    }
    return { provider, accounts: retry };
  }

  return { provider, accounts };
}

/**
 * Перемикає мережу на BSC (або додає її, якщо відсутня).
 * Враховано поширений збій MetaMask Mobile із switch – робимо другу спробу після add.
 */
export async function ensureBSC(provider: Eip1193Provider): Promise<void> {
  // Перевіряємо поточний chain
  let current: string | undefined;
  try {
    current = await provider.request({ method: 'eth_chainId' });
  } catch {
    // ігноруємо – спробуємо просто свічнути
  }
  if (current && current.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;

  // Спроба перемкнути
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }],
    });
    return;
  } catch (err: any) {
    // 4902 – мережу не додано у MetaMask
    if (err?.code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [BSC_PARAMS],
        });
        // Декотрі клієнти не перемикають автоматично після add – робимо явний switch
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BSC_PARAMS.chainId }],
        });
        return;
      } catch (addErr: any) {
        throw new Error(`Не вдалося додати/активувати мережу BSC: ${addErr?.message || addErr}`);
      }
    }
    // Інша помилка свічу
    throw new Error(`Перемикання мережі на BSC не вдалося: ${err?.message || err}`);
  }
}

/**
 * Очікує, поки вкладка знову стане видимою (корисно для повернення з MetaMask Mobile),
 * або поки не сплине timeout.
 */
export function waitForReturn(timeoutMs = 15000): Promise<void> {
  if (!isClient) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        document.removeEventListener('visibilitychange', onVis);
      } catch {}
      resolve();
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') finish();
    };

    document.addEventListener('visibilitychange', onVis, { passive: true });

    // Якщо вже видима – завершити одразу
    if (document.visibilityState === 'visible') {
      finish();
      return;
    }

    // Таймаут безпеки
    setTimeout(finish, timeoutMs);
  });
}
