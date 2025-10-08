import { supabase } from "./supabase";
import { consumeHandoff } from "./handoff";

export async function bootstrapSessionHandoff(): Promise<void> {
  try {
    const sp = new URLSearchParams(window.location.search);
    const handoff = sp.get("handoff");
    if (handoff) {
      const creds = await consumeHandoff(handoff);
      if (creds?.at && creds?.rt) {
        await supabase.auth.setSession({
          access_token: creds.at,
          refresh_token: creds.rt,
        });
      }
      sp.delete("handoff");
      const cleaned = `${window.location.pathname}?${sp.toString()}`.replace(/\?$/, "");
      window.history.replaceState(null, "", cleaned);
    }
  } catch (e) {
    console.warn("bootstrapSessionHandoff error:", e);
  }
}
