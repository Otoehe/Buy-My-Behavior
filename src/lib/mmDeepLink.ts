// src/lib/mmDeepLink.ts
/* Утиліти для відкриття сторінок Dapp у MetaMask (deeplink / in-app). */

const APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || '').replace(/\/+$/, '');

/** Груба перевірка мобільного UA */
export function isMobileUA(): boolean {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

/** Чи ми всередині вбудованого браузера MetaMask */
export function isMetaMaskInApp(): boolean {
  const ua = navigator.userAgent || '';
  // MetaMaskMobile зустрічається у офіційному UA
  if (/MetaMaskMobile/i.test(ua)) return true;

  // запасний варіант: мобільний UA + наявний ethereum.isMetaMask
  const eth: any = (window as any).ethereum;
  return !!(eth && eth.isMetaMask && /Mobile/i.test(ua) && /Android|iPhone|iPad|iPod/i.test(ua));
}

/** Перетворює відносний шлях у абсолютний URL нашого застосунку */
function buildAbsoluteUrl(to: string): string {
  if (/^https?:\/\//i.test(to)) return to;
  const path = to.startsWith('/') ? to : `/${to}`;
  return APP_URL ? `${APP_URL}${path}` : path;
}

/** Формує deeplink для MetaMask: https://metamask.app.link/dapp/<host+path> */
function toMetaMaskDeeplink(absUrl: string): string {
  // прибираємо протокол для формату /dapp/<host+path>
  const noProto = absUrl.replace(/^https?:\/\//i, '');
  return `https://metamask.app.link/dapp/${noProto}`;
}

/**
 * Відкрити сторінку нашого Dapp у MetaMask.
 * - Якщо вже в in-app браузері MM: простий redirect на внутрішній шлях
 * - Інакше: відкриваємо офіційний deeplink MM (перемикає в додаток)
 */
export async function openInMetaMaskTo(to: string): Promise<void> {
  const abs = buildAbsoluteUrl(to);

  if (isMetaMaskInApp()) {
    // без створення нових вкладок у MM
    location.assign(abs);
    return;
  }

  const deeplink = toMetaMaskDeeplink(abs);

  // На мобільних відкриття посилання через клік — найстабільніше
  const a = document.createElement('a');
  a.href = deeplink;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
}

/** Зворотна сумісність зі старою назвою */
export const openInMetaMaskDapp = openInMetaMaskTo;
