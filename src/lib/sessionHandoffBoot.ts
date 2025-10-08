// src/lib/sessionHandoffBoot.ts
import { supabase } from "./supabase";
import { consumeHandoff } from "./handoff";
import { getCookie, delCookie } from "./cookies";

/**
 * Викликати ДО рендера App (у main.tsx).
 * Піднімає сесію з ?handoff=... або з cookie bb_handoff,
 * потім чистить URL і видаляє cookie.
 */
export async function bootstrapSessionHandoff(): Promise<void> {
  try {
    const sp = new URLSearchParams(window.location.search);
    let handoff = sp.get("handoff");

    if (!handoff) {
      handoff = getCookie("bb_handoff");
    }

    if (handoff) {
      const creds = await consumeHandoff(handoff);
      if (creds?.at && creds?.rt) {
        await supabase.auth.setSession({
          access_token: creds.at,
          refresh_token: creds.rt,
        });
      }
      delCookie("bb_handoff");
      sp.delete("handoff");
      const cleaned = `${window.location.pathname}?${sp.toString()}`.replace(/\?$/, "");
      window.history.replaceState(null, "", cleaned);
    }
  } catch (e) {
    console.warn("bootstrapSessionHandoff error:", e);
  }
}
