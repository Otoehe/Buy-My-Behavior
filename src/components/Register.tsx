import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ethers } from "ethers";
import { useNavigate, useSearchParams } from "react-router-dom";

// ----- UI/Env -----
type Phase = "idle" | "sending" | "sent" | "error";

const APP_URL =
  (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://buymybehavior.com");

// BMB модалки
function openBmb(payload: {
  kind?:
    | "success"
    | "warning"
    | "error"
    | "confirm"
    | "tx"
    | "info"
    | "magic"
    | "congratsCustomer"
    | "congratsPerformer";
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actionLabel?: string;
  noBackdropClose?: boolean;
  hideClose?: boolean;
}) {
  window.dispatchEvent(new CustomEvent("bmb:modal:open", { detail: payload }));
}
function closeBmb() {
  window.dispatchEvent(new Event("bmb:modal:close"));
}

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [email, setEmail] = useState("");
  const [refWord, setRefWord] = useState(params.get("ref") || "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [busyBtn, setBusyBtn] = useState<string | null>(null);

  const redirectTo = useMemo(() => `${APP_URL}/auth/callback?next=/map`, []);

  // 💡 На всяк випадок: при заході на /register закриємо будь-які залишкові модалки,
  // і прокрутимо до верху. Також додамо клас до body для дебагу, якщо треба.
  useEffect(() => {
    try { closeBmb(); } catch {}
    try { window.scrollTo(0, 0); } catch {}
    try { document.body.classList.add("bmb-register-open"); } catch {}
    return () => {
      try { document.body.classList.remove("bmb-register-open"); } catch {}
    };
  }, []);

  // ---------- Supabase helpers ----------
  const verifyReferral = async (word: string) => {
    const code = word.trim();
    if (!code) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, wallet, wallet_address, referral_code")
      .eq("referral_code", code)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data; // або null
  };

  const sendMagicLink = async (emailValue: string) => {
    return supabase.auth.signInWithOtp({
      email: emailValue.trim(),
      options: { emailRedirectTo: redirectTo },
    });
  };

  const saveRefContext = (ref: any) => {
    try {
      localStorage.setItem(
        "bmb_ref_context",
        JSON.stringify({
          referred_by: ref?.id ?? null,
          referrer_wallet: ref?.wallet || ref?.wallet_address || null,
          referral_code: ref?.referral_code ?? refWord.trim(),
        })
      );
    } catch {}
  };

  // ---------- Дії ----------
  const onRegister = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) {
        openBmb({
          kind: "info",
          title: "Повідомлення",
          subtitle: "Вкажіть email.",
          actionLabel: "Добре",
        });
        return;
      }
      if (!refWord.trim()) {
        openBmb({
          kind: "warning",
          title: "Реєстрація лише за реферальним словом",
          subtitle: "Введіть реферальне слово амбасадора.",
          actionLabel: "Добре",
        });
        return;
      }

      try {
        setPhase("sending");
        setBusyBtn("register");

        const ref = await verifyReferral(refWord);
        if (!ref) {
          setPhase("error");
          openBmb({
            kind: "error",
            title: "Невірне реферальне слово",
            subtitle: "Перевірте правильність.",
            actionLabel: "Ок",
          });
          return;
        }

        saveRefContext(ref);

        const { error } = await sendMagicLink(email);
        if (error) throw error;

        setPhase("sent");
        openBmb({
          kind: "magic",
          title: "Магік-лінк надіслано",
          subtitle: (
            <>
              Перевір пошту <b>{email}</b>. Відкрий посилання у зовнішньому браузері.
            </>
          ),
          actionLabel: "Добре",
        });
      } catch (err: any) {
        setPhase("error");
        openBmb({
          kind: "error",
          title: "Сталася помилка",
          subtitle: String(err?.message || err),
          actionLabel: "Добре",
        });
      } finally {
        setBusyBtn(null);
      }
    },
    [email, refWord, redirectTo]
  );

  const onLogin = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      if (!email.trim()) {
        openBmb({
          kind: "info",
          title: "Повідомлення",
          subtitle: "Вкажіть email.",
          actionLabel: "Добре",
        });
        return;
      }

      try {
        setPhase("sending");
        setBusyBtn("login");

        const { error } = await sendMagicLink(email);
        if (error) throw error;

        setPhase("sent");
        openBmb({
          kind: "magic",
          title: "Магік-лінк надіслано",
          subtitle: (
            <>
              Перевір пошту <b>{email}</b> і відкрий у браузері.
            </>
          ),
          actionLabel: "Добре",
        });
      } catch (err: any) {
        setPhase("error");
        openBmb({
          kind: "error",
          title: "Помилка",
          subtitle: String(err?.message || err),
          actionLabel: "Добре",
        });
      } finally {
        setBusyBtn(null);
      }
    },
    [email, redirectTo]
  );

  const onWalletLogin = useCallback(async () => {
    try {
      setPhase("sending");
      setBusyBtn("wallet");

      if (!(window as any).ethereum) {
        openBmb({
          kind: "info",
          title: "MetaMask не знайдено",
          subtitle: "Встановіть MetaMask або відкрийте сайт у MetaMask-браузері.",
          actionLabel: "Зрозуміло",
        });
        return;
      }

      const provider = new ethers.providers.Web3Provider((window as any).ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      const message = `BMB Login\nWallet: ${address}\nTime: ${Date.now()}`;
      const signature = await signer.signMessage(message);
      const recovered = ethers.utils.verifyMessage(message, signature);

      if (recovered.toLowerCase() !== address.toLowerCase()) {
        openBmb({
          kind: "error",
          title: "Підпис не збігається",
          subtitle: "Спробуйте ще раз.",
          actionLabel: "OK",
        });
        return;
      }

      // реєстрація/вхід через гаманець
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .or(`wallet.eq.${address},wallet_address.eq.${address}`)
        .limit(1)
        .maybeSingle();

      if (!existing) {
        if (!refWord.trim()) {
          openBmb({
            kind: "warning",
            title: "Потрібен реферальний код",
            subtitle: "Введіть реферальний код, щоб завершити реєстрацію через MetaMask.",
            actionLabel: "Добре",
          });
          return;
        }
        const ref = await verifyReferral(refWord);
        if (!ref) {
          openBmb({
            kind: "error",
            title: "Невірне реферальне слово",
            subtitle: "Перевірте правильність або зверніться до амбасадора.",
            actionLabel: "Ок",
          });
          return;
        }

        saveRefContext(ref);

        const base: Record<string, any> = {
          created_at: new Date().toISOString(),
          wallet: address,
          wallet_address: address,
          referred_by: ref?.id ?? null,
          referrer_wallet: ref?.wallet || ref?.wallet_address || null,
          referral_code: ref?.referral_code ?? refWord.trim(),
        };

        const { error: insertError } = await supabase.from("profiles").insert(base);
        if (insertError) {
          openBmb({
            kind: "error",
            title: "Помилка створення профілю",
            subtitle: insertError.message,
            actionLabel: "OK",
          });
          return;
        }
      }

      localStorage.setItem("wallet_address", address);
      navigate("/map", { replace: true });
    } catch (err: any) {
      openBmb({
        kind: "error",
        title: "Помилка MetaMask",
        subtitle: String(err?.message || err),
        actionLabel: "OK",
      });
    } finally {
      setPhase("idle");
      setBusyBtn(null);
    }
  }, [navigate, refWord]);

  const disableAll = phase === "sending" || !!busyBtn;

  return (
    <div
      style={{
        minHeight: "calc(100vh - 120px)",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
        // ⬇️ АНТИ-ОВЕРЛЕЙ: реєстрація САМА поверх усього
        position: "relative",
        zIndex: 9001,
        background: "#fff",
      }}
    >
      <div
        style={{
          width: "min(680px, 92vw)",
          background: "#f7f7f7",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 30px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)",
          border: "1px solid #eaeaea",
          position: "relative",
          zIndex: 9002,
        }}
      >
        <h1
          style={{
            margin: "8px 0 20px",
            fontSize: 24,
            fontWeight: 800,
            textAlign: "center",
            color: "#111",
          }}
        >
          Реєстрація з реферальним словом
        </h1>

        <form onSubmit={onRegister} style={{ display: "grid", gap: 14 }}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              height: 48,
              borderRadius: 12,
              border: "1px solid #e3e3e3",
              padding: "0 14px",
              fontSize: 16,
              outline: "none",
              background: "#eaf2ff",
              color: "#111",
            }}
            autoComplete="email"
          />

          <input
            type="text"
            value={refWord}
            onChange={(e) => setRefWord(e.target.value)}
            placeholder="Реферальний код"
            style={{
              height: 48,
              borderRadius: 12,
              border: "1px solid #e3e3e3",
              padding: "0 14px",
              fontSize: 16,
              outline: "none",
              background: "#fff",
              color: "#111",
            }}
            autoComplete="one-time-code"
          />

          <button
            type="submit"
            disabled={disableAll && busyBtn !== "register"}
            style={{
              height: 52,
              borderRadius: 12,
              border: "1px solid #000",
              background: "#000",
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
              opacity: disableAll && busyBtn !== "register" ? 0.7 : 1,
            }}
          >
            Зареєструватися
          </button>

          <button
            type="button"
            onClick={onLogin}
            disabled={disableAll && busyBtn !== "login"}
            style={{
              height: 52,
              borderRadius: 12,
              border: "1px solid #000",
              background: "#000",
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
              opacity: disableAll && busyBtn !== "login" ? 0.7 : 1,
            }}
          >
            Увійти (magic link)
          </button>

          <button
            type="button"
            onClick={onWalletLogin}
            disabled={disableAll && busyBtn !== "wallet"}
            style={{
              height: 52,
              borderRadius: 12,
              border: "1px solid #000",
              background: "#ffcdd6",
              color: "#000",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
              opacity: disableAll && busyBtn !== "wallet" ? 0.7 : 1,
            }}
          >
            Продовжити через MetaMask
          </button>
        </form>
      </div>
    </div>
  );
}
