/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./supabase";

/** Чи ми вже всередині вбудованого браузера MetaMask */
export function isMetaMaskInApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MetaMaskMobile/i.test(navigator.userAgent);
}

/**
 * Відкрити наш сайт у MetaMask-браузері і передати туди чинну сесію Supabase.
 * nextPath — куди повернути користувача після відкриття (у межах нашого сайту).
 */
export async function openInMetaMaskDapp(nextPath = "/my-orders"): Promise<void> {
  // 1) забираємо поточну сесію (якщо користувач уже залогінений у звичайному браузері)
  const { data } = await supabase.auth.getSession();
  const at = data.session?.access_token || null;
  const rt = data.session?.refresh_token || null;

  // 2) формуємо payload і кладемо його в #hash, щоб НЕ потрапляло у логи/реферери
  const payload = {
    ver: 1,
    ts: Date.now(),
    next: nextPath,
    at,
    rt,
  };
  const frag = "#bmbSess=" + encodeURIComponent(btoa(JSON.stringify(payload)));

  // 3) диплінк у MetaMask (офіційний формат app.link)
  const host = location.host; // www.buymybehavior.com
  const dappUrl = `https://metamask.app.link/dapp/${host}/auth/handoff${frag}`;

  // 4) запускаємо app-switch
  window.location.href = dappUrl;
}
