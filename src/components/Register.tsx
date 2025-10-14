import React, { useCallback, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";

// ----- UI/Env -----
type Phase = "idle" | "sending" | "sent" | "error";

const APP_URL =
  (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://buymybehavior.com");

// BMB модалки (ти вже їх використовуєш у проєкті)
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
  const [email, setEmail] = useState("");
  const [refWord, setRefWord] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [busyBtn, setBusyBtn] = useState<string | null>(null);

  const redirectTo = useMemo(() => `${APP_URL}/auth/callback?next=/map`, []);
  const navigate = useNavigate();

  // ---------- Supabase helpers ----------
  const verifyReferral = async (word: string) => {
    const code = word.trim();
    if (!code) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, wallet, wallet_address, referral_code")
      .eq("referral_code", code)
      .limit(1)
      .maybeSingle(); // не падати, якщо немає рядка

    if (error) throw error;
    return data; // або null
  };

  const sendMagicLink = async (emailValue: string) => {
    return supabase.auth.signInWithOtp({
      email: emailValue.trim(),
      options: { emailRedirectTo: redirectTo },
    });
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

        // Перевіряємо реф-код
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

        // Запам'ятовуємо локальний контекст реферала для подальшого створення профілю
        try {
          localStorage.setItem(
            "bmb_ref_context",
            JSON.stringify({
              referred_by: ref.id,
              referrer_wallet: ref.wallet || ref.wallet_address || "",
              referral_code: ref.referral_code,
            })
          );
        } catch {}

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

  // ---------- Вхід через MetaMask ----------
  const onWalletLogin = useCallback(async () => {
    try {
      setPhase("sending");
      setBusyBtn("wallet");

      if (!(window as any).ethereum) {
        openBmb({
          kind: "info",
          title: "MetaMask не знайдено",
          subtitle: "Будь ласка, встановіть розширення MetaMask або відкрийте в MetaMask-браузері.",
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
          subtitle: "Будь ласка, спробуйте ще раз.",
          actionLabel: "OK",
        });
        return;
      }

      // Якщо профіль з таким гаманцем ще не існує — створюємо
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .or(`wallet.eq.${address},wallet_address.eq.${address}`)
        .limit(1)
        .maybeSingle();

      if (!existing) {
        const context = localStorage.getItem("bmb_ref_context");
        const base: Record<string, any> = {
          created_at: new Date().toISOString(),
        };

        // підтримуємо обидві назви поля
        base.wallet = address;
        base.wallet_address = address;

        if (context) {
          try {
            const parsed = JSON.parse(context);
            base.referred_by = parsed.referred_by ?? null;
            base.referrer_wallet = parsed.referrer_wallet ?? null;
            base.referral_code = parsed.referral_code ?? null;
          } catch {}
        }

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
  }, [navigate]);

  // ---------- UI ----------
  const isBusy = phase === "sending";
  const disableAll = isBusy || !!busyBtn;

  return (
    <div style={pageWrap}>
      <div style={card}>
        <h1 style={title}>Реєстрація з реферальним словом</h1>

        <form onSubmit={onRegister} style={formGrid}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ ...input, background: "#eaf2ff" }}
            autoComplete="email"
          />

          <input
            type="text"
            value={refWord}
            onChange={(e) => setRefWord(e.target.value)}
            placeholder="Реферальний код"
            style={input}
            autoComplete="one-time-code"
          />

          <button
            type="submit"
            disabled={disableAll && busyBtn !== "register"}
            style={{ ...btnBlack, opacity: disableAll && busyBtn !== "register" ? 0.7 : 1 }}
          >
            Зареєструватися
          </button>

          <button
            type="button"
            onClick={onLogin}
            disabled={disableAll && busyBtn !== "login"}
            style={{ ...btnBlack, opacity: disableAll && busyBtn !== "login" ? 0.7 : 1 }}
          >
            Увійти (magic link)
          </button>

          <button
            type="button"
            onClick={onWalletLogin}
            disabled={disableAll && busyBtn !== "wallet"}
            style={{ ...btnMetaMask, opacity: disableAll && busyBtn !== "wallet" ? 0.7 : 1 }}
          >
            Увійти через MetaMask
          </button>
        </form>
      </div>
    </div>
  );
}

// ----- Styles -----
const pageWrap: React.CSSProperties = {
  minHeight: "calc(100vh - 120px)",
  display: "grid",
  placeItems: "center",
  padding: "32px 16px",
};

const card: React.CSSProperties = {
  width: "min(680px, 92vw)",
  background: "#f7f7f7",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 30px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)",
  border: "1px solid #eaeaea",
};

const title: React.CSSProperties = {
  margin: "8px 0 20px",
  fontSize: 24,
  fontWeight: 800,
  textAlign: "center",
  color: "#111",
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const input: React.CSSProperties = {
  height: 48,
  borderRadius: 12,
  border: "1px solid #e3e3e3",
  padding: "0 14px",
  fontSize: 16,
  outline: "none",
  background: "#fff",
  color: "#111",
};

const btnBlack: React.CSSProperties = {
  height: 52,
  borderRadius: 12,
  border: "1px solid #000",
  background: "#000",
  color: "#fff",
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
};

const btnMetaMask: React.CSSProperties = {
  ...btnBlack,
  background: "#ffcdd6",
  color: "#000",
  border: "1px solid #000",
};
