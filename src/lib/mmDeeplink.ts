// src/lib/mmDeepLink.ts
import { createHandoff } from "./handoff";
import { setCookie } from "./cookies";

const APP_URL =
  (import.meta.env.VITE_PUBLIC_APP_URL as string) ||
  (typeof window !== "undefined" ? window.location.origin : "https://www.buymybehavior.com");

function buildUrl(path: string, extra: Record<string, string> = {}) {
  const u = new URL(path, APP_URL);
  Object.entries(extra).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  return u.toString();
}

/**
 * Відкриває нашу сторінку у MetaMask Browser.
 * Крім query-параметра, кладемо `handoff` у cookie — якщо MetaMask обріжe query,
 * бут-скрипт все одно знайде хенд-офф по cookie.
 */
export async function openInMetaMaskDapp(path: string, extra: Record<string, string> = {}) {
  const handoff = await createHandoff();         // одноразовий токен для переносу сесії
  const url = buildUrl(path, { ...extra, ...(handoff ? { handoff } : {}) });

  if (handoff) {
    setCookie("bb_handoff", handoff, 300);      // <- ключовий момент
  }

  const deep = `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`;
  window.location.href = deep;
}
