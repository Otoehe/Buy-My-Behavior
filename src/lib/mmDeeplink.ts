// src/lib/mmDeepLink.ts
import { createHandoff } from "./handoff";

const APP_URL =
  (import.meta.env.VITE_PUBLIC_APP_URL as string) ||
  (typeof window !== "undefined" ? window.location.origin : "https://www.buymybehavior.com");

function buildUrl(path: string, extra: Record<string, string> = {}) {
  const u = new URL(path, APP_URL);
  Object.entries(extra).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  return u.toString();
}

export async function openInMetaMaskDapp(path: string, extra: Record<string, string> = {}) {
  const handoff = await createHandoff();                  // << коротке одноразове посилання на токени
  const url = buildUrl(path, { ...extra, ...(handoff ? { handoff } : {}) });

  const deep = `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`;
  window.location.href = deep;
}
