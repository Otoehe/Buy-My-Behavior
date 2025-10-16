// src/lib/handoff.ts
import { supabase } from "./supabase";

function randomNonce(len = 24) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+/g, "");
}

export async function createHandoff(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const at = data?.session?.access_token;
  const rt = data?.session?.refresh_token;
  if (!at || !rt) return null;

  const nonce = randomNonce(18);
  const { error } = await supabase.from("handoff_tokens").insert({
    nonce,
    access_token: at,
    refresh_token: rt,
  });
  if (error) {
    console.error("handoff insert error", error);
    return null;
  }
  return nonce;
}

export async function consumeHandoff(nonce: string): Promise<{at:string; rt:string} | null> {
  if (!nonce) return null;
  const { data, error } = await supabase
    .from("handoff_tokens")
    .select("access_token, refresh_token")
    .eq("nonce", nonce)
    .single();

  if (error || !data) {
    console.warn("handoff read error", error);
    return null;
  }
  try { await supabase.from("handoff_tokens").delete().eq("nonce", nonce); } catch {}
  return { at: data.access_token, rt: data.refresh_token };
}
