// src/lib/mmDeeplink.ts
/* Створює правильне deep-link посилання для відкриття сторінки у браузері MetaMask.
   Приклад результату:
   https://metamask.app.link/dapp/www.buymybehavior.com/my-orders?foo=bar
*/
export function buildMetaMaskDappUrl(pathAndQuery: string): string {
  const host = (typeof window !== "undefined" ? window.location.host : "www.buymybehavior.com");
  // pathAndQuery мусить починатися з "/"
  const p = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  // формат від MetaMask: metamask.app.link/dapp/<DOMAIN><PATH_AND_QUERY>
  return `https://metamask.app.link/dapp/${host}${p}`;
}

/** Відкрити у браузері MetaMask будь-який шлях (з query).
 *  Якщо ми вже знаходимося в браузері MetaMask — просто робимо location.href.
 */
export function openInMetaMask(pathAndQuery: string) {
  const url = buildMetaMaskDappUrl(pathAndQuery);
  // якщо ми вже у MetaMask Browser, відкриваємо напряму потрібний URL,
  // інакше — через metamask.app.link
  try {
    const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "");
    if (/MetaMaskMobile/i.test(ua)) {
      window.location.href = pathAndQuery; // відкрити локально в тій же вкладці
      return;
    }
  } catch {}
  window.location.href = url;
}
