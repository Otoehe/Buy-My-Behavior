/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./supabase";

/** Парсинг нашого payload з #hash */
function parseSessFromHash():
  | { at?: string | null; rt?: string | null; next?: string }
  | null {
  try {
    const m = (location.hash || "").match(/bmbSess=([^&]+)/);
    if (!m) return null;
    const json = atob(decodeURIComponent(m[1]));
    const obj = JSON.parse(json);
    return {
      at: obj?.at ?? null,
      rt: obj?.rt ?? null,
      next: typeof obj?.next === "string" ? obj.next : "/my-orders",
    };
  } catch {
    return null;
  }
}

/**
 * Викликається ДО рендера React (див. import у src/main.tsx).
 * Якщо прийшли через диплінк у MetaMask, відновлюємо сесію
 * і відразу переходимо на потрібний шлях.
 */
export async function bootstrapSessionHandoff(): Promise<void> {
  const sess = parseSessFromHash();
  if (!sess) return;

  // прибираємо hash з адресного рядка (щоб не лишався в історії)
  history.replaceState(null, "", location.pathname + location.search);

  // якщо є токени — відновлюємо сесію
  if (sess.at && sess.rt) {
    try {
      await supabase.auth.setSession({
        access_token: sess.at,
        refresh_token: sess.rt,
      });
    } catch (e) {
      console.warn("[handoff] setSession failed", e);
    }
  }

  // ідемо на цільову сторінку
  const next = sess.next && sess.next.startsWith("/") ? sess.next : "/my-orders";
  if (location.pathname + location.search !== next) {
    location.replace(next);
  }
}
