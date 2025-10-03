// src/lib/providerBridge.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import MetaMaskSDK from '@metamask/sdk';

/** EIP-1193 базовий тип провайдера */
export interface Eip1193Provider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
}

/* -------------------- ENV / Chain config -------------------- */
const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38'; // BSC mainnet by default
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

const ENV_CHAIN_NAME = (import.meta.env.VITE_CHAIN_NAME as string) ?? 'BNB Smart Chain';
const ENV_RPC_URL    = (import.meta.env.VITE_RPC_URL as string)    ?? 'https://bsc-dataseed.binance.org';
const ENV_EXPLORER   = (import.meta.env.VITE_BLOCK_EXPLORER as string) ?? 'https://bscscan.com';

const ADD_CHAIN_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: ENV_CHAIN_NAME,
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: [ENV_RPC_URL],
  blockExplorerUrls: [ENV_EXPLORER],
};

/* -------------------- Helpers -------------------- */
function isMobileUA(): boolean {
  const ua = navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

/** Будує deep-link для відкриття нашого dApp у мобільному MetaMask браузері */
export function buildMetaMaskDappDeeplink(url?: string): string {
  const target = url ?? (window?.location ? window.location.origin + window.location.pathname + window.location.search : '');
  // Працює формат metamask.app.link/dapp/<FULL_URL>
  return `https://metamask.app.link/dapp/${target.replace(/^https?:\/\//, '')}`;
}

/** Очікує потрібний chainId через подію chainChanged або опитування */
async function waitForChain(
  provider: Eip1193Provider,
  expectedHex: string,
  timeoutMs = 8_000
): Promise<boolean> {
  let done = false;
  let timer: number | undefined;

  const off = (fn?: (...a: any[]) => void) => {
    try { if (fn && provider.removeListener) provider.removeListener('chainChanged', fn); } catch {}
  };

  const immediateCheck = async () => {
    try {
      const cur = await provider.request({ method: 'eth_chainId' });
      if (typeof cur === 'string' && cur.toLowerCase() === expectedHex.toLowerCase()) return true;
    } catch {}
    return false;
  };

  const okNow = await immediateCheck();
  if (okNow) return true;

  const onChange = (hex: string) => {
    if (hex?.toLowerCase() === expectedHex.toLowerCase()) {
      done = true;
      off(onChange);
      if (timer) window.clearTimeout(timer);
    }
  };

  provider.on?.('chainChanged', onChange);

  const started = Date.now();
  while (!done && Date.now() - started < timeoutMs) {
    const ok = await immediateCheck();
    if (ok) { done = true; break; }
    await new Promise(r => setTimeout(r, 600));
  }

  off(onChange);
  if (timer) window.clearTimeout(timer);
  return done;
}

/* -------------------- MetaMask SDK singleton -------------------- */
let sdk: MetaMaskSDK | null = null;
let sdkProvider: Eip1193Provider | null = null;
let connectInFlight: Promise<{ provider: Eip1193Provider }> | null = null;

function getSDK(): MetaMaskSDK {
  if (!sdk) {
    sdk = new MetaMaskSDK({
      dappMetadata: {
        name: 'Buy My Behavior',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://app.buymybehavior.com',
      },
      // Важливе для мобільного: deeplink + shim web3
      useDeeplink: true,
      shouldShimWeb3: true,
      // За можливості WebRTC прискорює конект
      communicationLayerPreference: 'webrtc',
      logging: { developerMode: false },
      checkInstallationImmediately: false,
      preferDesktop: false,
    });
  }
  return sdk;
}

async function getSDKProvider(): Promise<Eip1193Provider> {
  if (sdkProvider) return sdkProvider;
  const S = getSDK();
  // @ts-expect-error типовий провайдер сумісний з EIP-1193
  const p: Eip1193Provider = S.getProvider();
  // За необхідності встановлюємо в window.ethereum для зручності
  (window as any).ethereum = p;
  sdkProvider = p;
  return p;
}

/* -------------------- Публічні API -------------------- */

/**
 * Повертає EIP-1193 провайдера:
 * - Desktop з розширенням MetaMask → window.ethereum
 * - Mobile у вбудованому MetaMask браузері → window.ethereum
 * - Mobile у звичайному браузері → MetaMask SDK (deeplink)
 */
export async function getProvider(): Promise<Eip1193Provider> {
  const injected = (window as any)?.ethereum as Eip1193Provider | undefined;

  // 1) Якщо ми в in-app браузері MetaMask (mobile) або на десктопі з MM — беремо інжектований
  if (injected && (injected.isMetaMask || !isMobileUA())) {
    return injected;
  }

  // 2) Інакше — мобільний звичайний браузер → MetaMask SDK з deeplink
  return await getSDKProvider();
}

/** Підключення акаунта. Кешує одночасні запити, не плодить конекти */
export async function connectWallet(): Promise<{ provider: Eip1193Provider; accounts: string[] }> {
  if (!connectInFlight) {
    connectInFlight = (async () => {
      const provider = await getProvider();

      // запитати акаунти
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];

      // прості listeners (опційно)
      provider.on?.('accountsChanged', (accs: string[]) => {
        // можна синхронізувати стан застосунку
        // console.log('accountsChanged', accs);
      });
      provider.on?.('chainChanged', (hex: string) => {
        // console.log('chainChanged', hex);
      });

      return { provider, accounts };
    })();

    // очистка після завершення
    connectInFlight.finally(() => { connectInFlight = null; });
  }
  return await connectInFlight;
}

/**
 * Гарантує, що активна мережа — наша (BSC/інша з env).
 * Під мобільним MetaMask іноді switch не спрацьовує — тоді кидає помилку з deeplink.
 */
export async function ensureBSC(provider?: Eip1193Provider): Promise<void> {
  const prov = provider ?? (await getProvider());

  // Якщо вже правильний chain — вийти
  const cur = (await prov.request({ method: 'eth_chainId' })) as string;
  if (cur?.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;

  // 1) Спробувати switch
  try {
    await prov.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }],
    });
    const ok = await waitForChain(prov, CHAIN_ID_HEX, 8000);
    if (ok) return;
  } catch (err: any) {
    // 2) Якщо мережу не додано — додати
    if (err?.code === 4902 /* Unrecognized chain */) {
      try {
        await prov.request({
          method: 'wallet_addEthereumChain',
          params: [ADD_CHAIN_PARAMS],
        });
        // Після додавання повторити switch (на мобільних не завжди авто-перемикає)
        await prov.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CHAIN_ID_HEX }],
        });
        const ok = await waitForChain(prov, CHAIN_ID_HEX, 8000);
        if (ok) return;
      } catch {}
    }
  }

  // 3) Фолбек для мобільних: запропонувати відкрити dApp у браузері MetaMask
  const deeplink = buildMetaMaskDappDeeplink();
  const message =
    'Не вдалося автоматично перемкнути мережу на Binance Smart Chain у MetaMask.\n' +
    'Будь ласка, відкрийте застосунок MetaMask, вручну виберіть мережу BSC, або відкрийте наш сайт у браузері MetaMask за посиланням:\n' +
    deeplink;
  const e: any = new Error(message);
  e.deeplink = deeplink;
  e.expectedChainId = CHAIN_ID_HEX;
  throw e;
}

export { CHAIN_ID_HEX, CHAIN_ID_DEC };
