// src/lib/providerBridge.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ethers } from 'ethers';
import {
  getSdkProvider,
  isMetaMaskInApp,
  isBrowser,
} from './metamaskSdk';

/**
 * Мінімальний EIP-1193 тип, щоб не тягнути сторонні типи.
 * Сумісний з window.ethereum та провайдером MetaMask SDK.
 */
export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  providers?: any[]; // для EIP-6963 мульти-провайдерів
};

const RAW_CHAIN_ID = (import.meta as any)?.env?.VITE_CHAIN_ID as string | undefined;
const CHAIN_ID_HEX = ((): string => {
  const fallback = '0x38'; // BSC mainnet
  if (!RAW_CHAIN_ID) return fallback;
  return RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
})();
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

/** Базові параметри BSC — використовуються тільки якщо ланцюжок не додано. */
const BSC_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: [
    // Не критично: будь-який публічний RPC BSC; за потреби покладіть у ENV
    'https://bsc-dataseed.binance.org',
  ],
  blockExplorerUrls: ['https://bscscan.com'],
} as const;

function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Вибрати інжектований MetaMask-провайдер, якщо їх кілька (EIP-6963). */
function pickInjectedMetaMask(eth: any): Eip1193Provider | null {
  if (!eth) return null;
  // Якщо є масив провайдерів — шукаємо MetaMask
  if (Array.isArray(eth.providers)) {
    const mm = eth.providers.find((p: any) => p?.isMetaMask);
    if (mm) return mm as Eip1193Provider;
  }
  // Інакше — якщо один інжектований і це MetaMask
  if (eth.isMetaMask) return eth as Eip1193Provider;
  return null;
}

/**
 * Повертає "правильний" провайдер залежно від середовища:
 * - MetaMask in-app → використовуємо інжектований window.ethereum
 * - Десктоп з розширенням → інжектований window.ethereum
 * - Мобільний браузер (не in-app) → провайдер із MetaMask SDK
 */
export async function getProvider(): Promise<Eip1193Provider> {
  if (!isBrowser()) {
    throw new Error('Provider unavailable: not in a browser context');
  }

  const eth = (window as any).ethereum;
  const injected = pickInjectedMetaMask(eth);

  // 1) Якщо ми всередині MetaMask in-app, завжди використовуємо інжектований
  if (isMetaMaskInApp() && injected) {
    return injected;
  }

  // 2) Якщо десктоп і є розширення MetaMask — також інжектований
  if (!isMobileUA() && injected) {
    return injected;
  }

  // 3) Мобільний браузер НЕ in-app → MetaMask SDK провайдер
  const sdkProvider = await getSdkProvider();
  return sdkProvider as Eip1193Provider;
}

/** Отримати поточний chainId (dec) із провайдера. */
export async function getChainId(provider: Eip1193Provider): Promise<number> {
  const hex = await provider.request({ method: 'eth_chainId' });
  // Деякі провайдери повертають dec; нормалізуємо
  const normalizedHex = typeof hex === 'string' ? hex : '0x' + Number(hex ?? CHAIN_ID_DEC).toString(16);
  return parseInt(normalizedHex, 16);
}

/**
 * Перемкнути або додати BSC (із CHAIN_ID_HEX).
 * Повертає поточний chainId (dec) після перемикання.
 */
export async function ensureBSC(provider?: Eip1193Provider): Promise<number> {
  const p = provider ?? (await getProvider());

  try {
    const current = await getChainId(p);
    if (current === CHAIN_ID_DEC) return current;

    await p.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }],
    });

    return CHAIN_ID_DEC;
  } catch (err: any) {
    // Якщо ланцюжок не додано — додаємо
    const code = err?.code ?? err?.data?.originalError?.code;
    const msg = (err?.message || '').toLowerCase();
    const notAdded = code === 4902 || msg.includes('unrecognized chain id') || msg.includes('chain not added');

    if (notAdded) {
      await p.request({
        method: 'wallet_addEthereumChain',
        params: [BSC_PARAMS],
      });
      return CHAIN_ID_DEC;
    }

    throw err;
  }
}

/**
 * Підключення акаунта + Web3Provider/Signer від ethers (v5).
 * Повертає { provider, ethersProvider, signer, address, accounts, chainId }.
 */
export async function connectWallet() {
  const provider = await getProvider();

  // Запит акаунтів має виконуватись у контексті gesture (клік кнопки)
  const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
  const address = (accounts?.[0] ?? '').toLowerCase();

  // Гарантуємо правильний ланцюг
  const chainId = await ensureBSC(provider);

  // Ethers.js v5 обгортка
  const ethersProvider = new ethers.providers.Web3Provider(provider as any, 'any');
  const signer = ethersProvider.getSigner();

  return { provider, ethersProvider, signer, address, accounts, chainId };
}

/** Підписка на зміну акаунтів (опційно). */
export function onAccountsChanged(
  provider: Eip1193Provider,
  cb: (accounts: string[]) => void,
) {
  provider?.on?.('accountsChanged', (accs: string[]) => cb(accs ?? []));
}

/** Підписка на зміну ланцюга (опційно). */
export function onChainChanged(
  provider: Eip1193Provider,
  cb: (chainIdDec: number) => void,
) {
  provider?.on?.('chainChanged', (hexOrDec: string | number) => {
    const hex = typeof hexOrDec === 'string' ? hexOrDec : '0x' + Number(hexOrDec).toString(16);
    cb(parseInt(hex, 16));
  });
}

/**
 * Допоміжна утиліта: чекаємо повернення користувача у вкладку (після deeplink у MetaMask),
 * але не довше, ніж timeoutMs. Потрібна для сумісності з існуючими імпортами у MyOrders.tsx.
 */
export async function waitForReturn(timeoutMs = 15000): Promise<void> {
  if (!isBrowser()) {
    await new Promise(res => setTimeout(res, timeoutMs));
    return;
  }
  if (!document.hidden) return;

  await new Promise<void>((resolve) => {
    let done = false;
    const onVis = () => {
      if (!document.hidden && !done) {
        done = true;
        document.removeEventListener('visibilitychange', onVis);
        resolve();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    setTimeout(() => {
      if (!done) {
        document.removeEventListener('visibilitychange', onVis);
        resolve();
      }
    }, timeoutMs);
  });
}
