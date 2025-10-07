// src/lib/supabaseSessionBridge.ts
import { supabase } from "./supabase";

/** Забираємо поточну сесію й пакуємо в base64, щоб передати у ?sb=... */
export async function packSbSessionParam(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const s = data?.session;
    if (!s?.access_token || !s?.refresh_token) return null;
    const payload = {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
    };
    return encodeURIComponent(btoa(JSON.stringify(payload)));
  } catch {
    return null;
  }
}

/** Якщо в URL є ?sb=<base64>, відновлюємо сесію Supabase без повторного логіну */
export async function restoreSbSessionFromQuery(): Promise<void> {
  try {
    const q = new URLSearchParams(window.location.search);
    const raw = q.get("sb");
    if (!raw) return;
    const json = JSON.parse(atob(decodeURIComponent(raw)));
    if (!json?.access_token || !json?.refresh_token) return;
    await supabase.auth.setSession({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
    });
  } catch {
    // ігноруємо — просто не відновиться авто-сесія
  }
}
