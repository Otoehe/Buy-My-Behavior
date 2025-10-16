// src/lib/metamaskSdk.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

// Легкі утиліти, які використовує providerBridge
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function isMetaMaskInApp(): boolean {
  if (!isBrowser()) return false;
  // Найнадійніша евристика для in-app
  return /MetaMaskMobile/i.test(navigator.userAgent);
}

// Лінива ініціалізація MetaMask SDK (без важких типів)
let _sdk: any = null;
let _sdkProvider: any = null;

function getAppUrl(): string {
  // беремо з ENV або з поточного origin
  const fromEnv = (import.meta as any)?.env?.VITE_PUBLIC_APP_URL as string | undefined;
  if (fromEnv && typeof fromEnv === 'string') return fromEnv;
  if (isBrowser()) return window.location.origin;
  return 'https://example.com';
}

/**
 * Повертає провайдер MetaMask SDK для мобільного браузера (deeplink).
 * На десктопі/в in-app ним не користуємось — там беремо injected window.ethereum.
 */
export async function getSdkProvider(): Promise<any> {
  if (_sdkProvider) return _sdkProvider;

  // Динамічний імпорт, щоб уникати проблем під час білду/SSR
  const mod: any = await import('@metamask/sdk');
  const MetaMaskSDK = mod?.default ?? mod?.MetaMaskSDK ?? mod;
  if (!MetaMaskSDK) {
    throw new Error('MetaMask SDK module not found');
  }

  const appUrl = getAppUrl();

  _sdk = new MetaMaskSDK({
    dappMetadata: {
      name: 'BMB',
      url: appUrl,
    },
    // для мобільного сценарію нам потрібен deeplink
    useDeeplink: true,
    // не робимо зайвих перевірок інсталяції
    checkInstallationImmediately: false,
    // можна додати інші опції SDK за потреби
  });

  _sdkProvider = _sdk.getProvider();
  return _sdkProvider;
}
