/* eslint-disable @typescript-eslint/no-explicit-any */

// Мінімальні детектори середовища
export function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function isMetaMaskInApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MetaMaskMobile/i.test(navigator.userAgent);
}

/**
 * Відкриває нашу dApp у браузері MetaMask через deeplink.
 * Якщо передати handoff, додасть у URL hash `#bmbSess=...` (base64 JSON).
 *
 * @param path Напр., "/my-orders?scenario=abc"
 * @param handoff { at, rt, next } — токени сесії та бажаний next route
 */
export function openInMetaMaskDapp(
  path: string,
  handoff?: { at?: string | null; rt?: string | null; next?: string }
): void {
  const host =
    (import.meta as any)?.env?.VITE_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ||
    (typeof window !== "undefined" ? window.location.host : "www.buymybehavior.com");

  // абсолютний шлях без дубльованого слеша
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  let url = `https://metamask.app.link/dapp/${host}${cleanPath}`;

  if (handoff && (handoff.at || handoff.rt || handoff.next)) {
    const payload = {
      at: handoff.at ?? null,
      rt: handoff.rt ?? null,
      next: handoff.next && handoff.next.startsWith("/") ? handoff.next : cleanPath,
    };
    const b64 = btoa(JSON.stringify(payload));
    url += `#bmbSess=${encodeURIComponent(b64)}`;
  }

  // Переходимо — система сама підхопить MetaMask
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
}
