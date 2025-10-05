// src/lib/metamaskSdk.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BMB Mobile MetaMask SDK singleton.
 * - Стабільний EIP-1193 провайдер на мобільних через deep-link сесію.
 * - Фолбек: відкриття вашого дApp у MetaMask in-app браузері.
 * - Десктопний флоу (window.ethereum) не чіпаємо — це тільки базовий шар.
 */

import type { MetaMaskSDK as MetaMaskSDKCtor } from '@metamask/sdk';

// Ледаче імпортування, щоб не тягнути SDK там, де він не потрібен.
async function importSDK(): Promise<{ MetaMaskSDK: typeof MetaMaskSDKCtor }> {
  // @ts-ignore
  return await import('@metamask/sdk');
}

let _sdk: InstanceType<typeof (awaitedReturn<typeof importSDK>)['MetaMaskSDK']> | null = null;
let _sdkProvider: any | null = null;

// Допоміжний тип для "awaited"
type awaitedReturn<T> = T extends (...args: any[]) => Promise<infer R> ? R : never;

/** Отримати базовий публічний URL дApp з ENV (без трейлінг-слешів). */
export function getDappUrl(): string {
  const raw = (import.meta as any)?.env?.VITE_PUBLIC_APP_URL as string | undefined;
  if (!raw) return (typeof window !== 'undefined' ? window.location.origin : 'https://localhost').replace(/\/+$/, '');
  return raw.replace(/\/+$/, '');
}

/** Визначити, чи ми всередині MetaMask in-app браузера. */
export function isMetaMaskInApp(): boolean {
  if (typeof window === 'undefined') return false;
  const eth = (window as any).ethereum;
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
  const uaHints = /MetaMask|MetaMaskMobile/i.test(ua);
  const isMMInjected =
    !!eth?.isMetaMask ||
    (Array.isArray(eth?.providers) && eth.providers.some((p: any) => p?.isMetaMask));
  return Boolean(uaHints && isMMInjected);
}

/**
 * Ініціалізація (singleton) MetaMask SDK.
 * Мінімальна конфігурація для стабільного мобільного deep-link флоу.
 */
export async function getMetaMaskSDK() {
  if (_sdk) return _sdk;

  const { MetaMaskSDK } = await importSDK();
  const dappUrl = getDappUrl();

  _sdk = new MetaMaskSDK({
    useDeeplink: true,
    extensionOnly: false,
    checkInstallationImmediately: false,
    logging: { developerMode: false },

    dappMetadata: {
      name: 'Buy My Behavior (BMB)',
      url: dappUrl,
      icon: undefined, // можна вказати публічний шлях до іконки
    },

    i18nOptions: { enabled: false },
  }) as any;

  return _sdk!;
}

/** Повертає EIP-1193 провайдера із MetaMask SDK (singleton). */
export async function getSdkProvider(): Promise<any> {
  if (_sdkProvider) return _sdkProvider;
  const sdk = await getMetaMaskSDK();
  _sdkProvider = sdk.getProvider();
  return _sdkProvider!;
}

/**
 * Фолбек: відкрити ваш дApp в MetaMask in-app браузері.
 * Використовуйте лише якщо SDK-сесію не вдалося підняти впродовж 2–3с.
 */
export function openInMetaMaskApp(path?: string) {
  if (typeof window === 'undefined') return;
  const domain = getDappUrl().replace(/^https?:\/\//, '');
  const target = `https://link.metamask.io/dapp/${domain}${path ?? ''}`;
  window.location.href = target;
}

/** Захисний хелпер: чи ми в браузері. */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/** Простий delay для очікувань у флоу. */
export async function delay(ms: number): Promise<void> {
  await new Promise((res) => setTimeout(res, ms));
}
