import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const BSC_CHAIN_ID = "0x38"; // 56 BSC Mainnet

function getNext(search: string): string {
  try {
    const p = new URLSearchParams(search);
    const n = p.get("next");
    if (n && typeof n === "string" && n.trim().length > 0) return n;
  } catch {}
  const fromSess = sessionStorage.getItem("bmb_next_after_auth");
  return fromSess || "/map";
}

function getReferral(): { ref?: string; refCode?: string } {
  try {
    const p = new URLSearchParams(window.location.search);
    const ref = p.get("ref") || undefined;
    const refCode = p.get("refCode") || undefined;
    if (ref) sessionStorage.setItem("bmb_ref", ref);
    if (refCode) sessionStorage.setItem("bmb_refCode", refCode);
    return { ref, refCode };
  } catch {
    return {};
  }
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildMetaMaskDeepLink(next: string) {
  const host = window.location.host;
  return `https://metamask.app.link/dapp/${host}/login?next=${encodeURIComponent(next)}`;
}

async function ensureBSC() {
  const eth = (window as any).ethereum;
  if (!eth) return;
  try {
    const cur = await eth.request({ method: "eth_chainId" });
    if (cur?.toLowerCase() === BSC_CHAIN_ID) return;
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BSC_CHAIN_ID }],
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await (window as any).ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BSC_CHAIN_ID,
            chainName: "Binance Smart Chain",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: ["https://bsc-dataseed.binance.org/"],
            blockExplorerUrls: ["https://bscscan.com/"],
          },
        ],
      });
    }
  }
}

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const next = useMemo(() => getNext(location.search), [location.search]);

  const [status, setStatus] = useState<"idle" | "connecting" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string>("");

  // якщо є сесія — одразу пускаємо
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) navigate(next, { replace: true });
    })();
  }, [navigate, next]);

  const connectMetaMask = useCallback(async () => {
    setErrMsg("");
    setStatus("connecting");
    try {
      const eth = (window as any).ethereum;
      if (!eth) {
        if (isMobile()) {
          window.location.assign(buildMetaMaskDeepLink(next));
          return;
        } else {
          setStatus("error");
          setErrMsg("MetaMask не знайдено. Встанови розширення або відкрий сайт у MetaMask Mobile.");
          return;
        }
      }

      // розбираємо реферала (якщо є)
      const { ref, refCode } = getReferral();

      // під’єднати гаманець
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) throw new Error("Гаманець не під’єднано.");
      const myWallet = accounts[0];

      await ensureBSC();

      try { localStorage.setItem("bmb_wallet", myWallet); } catch {}

      // спробуємо записати/зафіксувати реферала (одноразово)
      try {
        const { data: me } = await supabase.auth.getUser();
        if (me?.user) {
          // оновимо власний гаманець у профілі (якщо треба)
          await supabase.from("profiles").update({ wallet: myWallet }).eq("user_id", me.user.id);

          // дізнаємося, чи вже є referrer
          const { data: prof } = await supabase
            .from("profiles")
            .select("referrer_wallet")
            .eq("user_id", me.user.id)
            .single();

          // спробуємо отримати адресу з refCode (якщо використовується)
          let refWallet: string | null = ref || null;
          if (!refWallet && !prof?.referrer_wallet) {
            const code = sessionStorage.getItem("bmb_refCode");
            if (code) {
              // якщо у вас є таблиця referral_codes(code -> wallet), дістаньте тут адресу:
              // const { data: rc } = await supabase.from("referral_codes").select("wallet").eq("code", code).single();
              // refWallet = rc?.wallet || null;
            }
          }

          // забороняємо самореферал
          if (refWallet && refWallet.toLowerCase() === myWallet.toLowerCase()) {
            refWallet = null;
          }

          if (!prof?.referrer_wallet && refWallet) {
            await supabase
              .from("profiles")
              .update({ referrer_wallet: refWallet, referred_at: new Date().toISOString() })
              .eq("user_id", me.user.id);

            await supabase.from("ref_events").insert({
              user_id: me.user.id,
              user_wallet: myWallet,
              referrer_wallet: refWallet,
              event_type: "signup",
            });
          }
        }
      } catch {
        /* no-op: реферал не критичний для входу */
      }

      setStatus("done");
      navigate(next, { replace: true, state: { from: "/login" } });
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e?.message || "Помилка під час підключення MetaMask.");
    }
  }, [next, navigate]);

  return (
    <div
      style={{
        minHeight: "calc(100dvh - 56px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          boxShadow: "0 12px 28px rgba(0,0,0,.08)",
          padding: 20,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Вхід через MetaMask</h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
          Після входу повернемо тебе на:{" "}
          <span style={{ color: "#111827", fontWeight: 700 }}>{next}</span>
        </p>

        <button
          type="button"
          onClick={connectMetaMask}
          disabled={status === "connecting"}
          style={{
            display: "inline-block",
            width: "100%",
            padding: "12px 16px",
            borderRadius: 999,
            background: "#000",
            color: "#fff",
            fontWeight: 800,
            border: 0,
            cursor: "pointer",
          }}
        >
          {status === "connecting" ? "З’єднання…" : "Увійти через MetaMask"}
        </button>

        {errMsg && (
          <div style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{errMsg}</div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: "#9ca3af" }}>
          На мобільному відкриємо MetaMask-додаток за потреби.
        </div>
      </div>
    </div>
  );
}
