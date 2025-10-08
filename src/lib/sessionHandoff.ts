import { supabase } from "./supabase";
import { openInMetaMaskDapp } from "./mmDeepLink";

/** Відкриває MetaMask in-app browser з поточною сесією Supabase */
export async function openInMMWithSession(targetPath: string) {
  const { data } = await supabase.auth.getSession();
  const at = data.session?.access_token || "";
  const rt = data.session?.refresh_token || "";
  const handoff =
    `/auth/handoff#` +
    `at=${encodeURIComponent(at)}` +
    `&rt=${encodeURIComponent(rt)}` +
    `&to=${encodeURIComponent(targetPath)}`;
  openInMetaMaskDapp(handoff);
}
