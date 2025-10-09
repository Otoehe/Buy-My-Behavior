/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./supabase";
import { isMetaMaskInApp } from "./isMetaMaskBrowser";

/**
 * Формує url виду https://metamask.app.link/dapp/<host>/<path>#bmbSess=...
 * Ми вантажимо корінь dapp із hash-хенд-оффом, а далі bootstrapSessionHandoff
 * переведе на next (наприклад, /escrow/approve?...).
 */
function buildMetamaskDeeplink(handoffUrl: string): string {
  const u = new URL(handoffUrl);
  // приклад: https://metamask.app.link/dapp/www.buymybehavior.com/#bmbSess=...
  return `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}${u.hash}`;
}

/** Створюємо handoff-url: <APP_ORIGIN>/#bmbSess=<base64-json> */
async function buildHandoffUrl(nextPath: string): Promise<string> {
  const appOrigin = import.meta.env.VITE_PUBLIC_APP_URL as string;
  const { data } = await supabase.auth.getSession();
  const at = data.session?.access_token ?? null;
  const rt = data.session?.refresh_token ?? null;

  const payload = {
    at,
    rt,
    next: nextPath.startsWith("/") ? nextPath : "/my-orders",
  };
  const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
  const url = new URL(appOrigin);
  url.hash = `bmbSess=${encoded}`;
  return url.toString();
}

/**
 * Відкрити шлях у MetaMask.
 * - Якщо ВЖЕ знаходимося у MetaMask-браузері — просто переходимо на nextPath (без нових вкладок).
 * - Якщо ЗОВНІ — відкриваємо deeplink у MetaMask.
 */
export async function openInMetaMaskTo(nextPath: string): Promise<void> {
  if (isMetaMaskInApp()) {
    // Уже в MetaMask → звичайна навігація (щоб не плодити вкладки)
    location.assign(nextPath);
    return;
  }
  const handoff = await buildHandoffUrl(nextPath);
  const deeplink = buildMetamaskDeeplink(handoff);
  location.href = deeplink;
}
