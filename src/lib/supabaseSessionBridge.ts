/* src/lib/supabaseSessionBridge.ts */
import { supabase } from "./supabase";

/** Допоміжне: встановити cookie з правильним доменом */
function setCookie(name: string, value: string, maxAgeSec: number) {
  const isHttps = location.protocol === "https:";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `Max-Age=${Math.max(1, Math.floor(maxAgeSec))}`,
    // для основного домену використовуємо .buymybehavior.com
    location.hostname.endsWith("buymybehavior.com") ? "Domain=.buymybehavior.com" : "",
    // Безпечно — але не заважає читати на клієнті (не HttpOnly)
    isHttps ? "Secure" : "",
    "SameSite=Lax",
  ].filter(Boolean);
  document.cookie = parts.join("; ");
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function delCookie(name: string) {
  const parts = [
    `${name}=`,
    "Path=/",
    "Max-Age=0",
    location.hostname.endsWith("buymybehavior.com") ? "Domain=.buymybehavior.com" : "",
  ].filter(Boolean);
  document.cookie = parts.join("; ");
}

/** Записати в cookie поточну сесію, щоб MetaMask webview міг її підхопити */
export async function writeSupabaseSessionCookie(maxAgeSec = 300): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const at = data?.session?.access_token ?? "";
    const rt = data?.session?.refresh_token ?? "";
    const exp = data?.session?.expires_at ?? 0;
    if (!rt) return false; // без refresh не відновимо сесію

    setCookie("bmb_rt", rt, maxAgeSec);
    if (at) setCookie("bmb_at", at, Math.min(maxAgeSec, Math.max(1, exp - Math.floor(Date.now() / 1000))));
    setCookie("bmb_flag", "1", maxAgeSec);
    return true;
  } catch (e) {
    console.warn("[writeSupabaseSessionCookie] fail", e);
    return false;
  }
}

/** Прочитати cookie й відновити сесію у новому webview (MetaMask) */
export async function consumeSupabaseSessionCookie(): Promise<boolean> {
  try {
    const rt = readCookie("bmb_rt");
    const at = readCookie("bmb_at");
    if (!rt && !at) return false;

    // Підкидаємо токени у supabase-js; якщо access_token протух —
    // бібліотека сама оновить по refresh_token
    const { data, error } = await supabase.auth.setSession({
      refresh_token: rt ?? "",
      access_token: at ?? "",
    });

    // при будь-якому результаті чистимо cookie (одноразовий хенд-офф)
    delCookie("bmb_rt");
    delCookie("bmb_at");
    delCookie("bmb_flag");

    if (error) {
      console.warn("[consumeSupabaseSessionCookie] setSession error:", error.message);
      return false;
    }
    return !!data.session;
  } catch (e) {
    console.warn("[consumeSupabaseSessionCookie] fail", e);
    return false;
  }
}

/** Чи ми щойно робили хенд-офф (ознака у cookie) */
export function wasHandoffPlanned(): boolean {
  return readCookie("bmb_flag") === "1";
}
