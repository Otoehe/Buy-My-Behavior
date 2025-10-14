// src/components/Register.tsx
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ethers } from "ethers";

// ─── UI/ENV ──────────────────────────
type Phase = "idle" | "sending" | "sent" | "error";

const APP_URL =
  (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://buymybehavior.com");

// модалки BMB (залишаю як у тебе)
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
  const [refWord, setRefWord] = useState(params.get("ref") || ""); // зчитуємо ?ref=
  const [phase, setPhase] = useState<Phase>("idle");

  // куди вертатись після підтвердження магік-лінка
  const redirectTo = useMemo(
    () => `${APP_URL}/auth/callback?next=/my-orders`,
    []
  );

  // ─────────────── Supabase helpers ───────────────
  // Перевірка реферального коду (повертаємо id + гаманець реферала)
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
    return data;
  };

  // Відправка magic-link
  const sendMagicLink = async (emailValue: string) => {
    return supabase.auth.signInWithOtp({
      email: emailValue.trim(),
      options: { emailRedirectTo: redirectTo },
    });
  };

  // Зберігаємо контекст реферала (щоб використати на бек/після колбеку)
  const saveRefContext = (ref: any) => {
    try {
      localStorage.setItem(
        "bmb_ref_context",
        JSON.stringify({
          referred_by: ref?.id ?? null,
          referrer_wallet: ref?.wallet ?? ref?.wallet_address ?? null,
          referral_code: ref?.referral_code ?? refWord.trim(),
        })
      );
    } catch {}
  };

  // ─────────────── Реєстрація (email + рефкод обов’язковий) ───────────────
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
          subtitle:
            "Введіть реферальне слово амбасадора. Без нього реєстрація недоступна.",
          actionLabel: "Добре",
        });
        return;
      }

      try {
        setPhase("sending");

        const ref = await verifyReferral(refWord);
        if (!ref) {
          setPhase("error");
          openBmb({
            kind: "error",
            title: "Невірне реферальне слово",
            subtitle: "Перевірте правильність коду або зверніться до амбасадора.",
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
              Перевір пошту <b>{email}</b>. Відкрий посилання у браузері.
            </>
          ),
          actionLabel: "Добре",
        });
      } catch (err: any) {
        setPhase("error");
        openBmb({
          kind: "error",
          title: "Сталася помилка",
          subtitle: String(err?.message ?? err),
          actionLabel: "Добре",
        });
      }
    },
    [email, refWord, redirectTo]
  );

  // ─────────────── Вхід (magic-link, БЕЗ рефкоду) ───────────────
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
          subtitle: String(err?.message ?? err),
          actionLabel: "Добре",
        });
      }
    },
    [email, redirectTo]
  );

  // ─────────────── Реєстрація/вхід через MetaMask (РЕФКОД обов’язковий для РЕЄСТРАЦІЇ) ───────────────
  const onWalletLogin = useCallback(async () => {
    try {
      if (!refWord.trim()) {
        openBmb({
          kind: "warning",
          title: "Потрібен реферальний код",
          subtitle:
            "Введіть реферальний код, щоб продовжити реєстрацію через MetaMask.",
          actionLabel: "Добре",
        });
        return;
      }

      setPhase("sending");

      if (!(window as any).ethereum) {
        openBmb({
          kind: "info",
          title: "Встановіть MetaMask",
          subtitle: "У браузері не знайдено провайдера Ethereum.",
          actionLabel: "Добре",
        });
        return;
      }

      // 1) Під’єднання гаманця + підпис повідомлення
      const provider = new ethers.providers.Web3Provider(
        (window as any).ethereum
      );
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

      // 2) Перевіримо, що рефкод валідний (реєстрація — тільки за кодом)
      const ref = await verifyReferral(refWord);
      if (!ref) {
        setPhase("error");
        openBmb({
          kind: "error",
          title: "Невірне реферальне слово",
          subtitle: "Перевірте правильність коду або зверніться до амбасадора.",
          actionLabel: "Ок",
        });
        return;
      }
      saveRefContext(ref);

      // 3) Якщо профіль існує — вважаємо це входом; якщо ні — реєструємо
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("wallet_address", address)
        .maybeSingle();

      if (!existing) {
        const ctxRaw = localStorage.getItem("bmb_ref_context");
        const base: any = {
          wallet_address: address,
          created_at: new Date().toISOString(),
        };
        if (ctxRaw) {
          try {
            const ctx = JSON.parse(ctxRaw);
            Object.assign(base, {
              referred_by: ctx?.referred_by ?? null,
              referrer_wallet: ctx?.referrer_wallet ?? null,
              referral_code: ctx?.referral_code ?? refWord.trim(),
            });
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

      // 4) Зберігаємо адресу локально (за потреби)
      try {
        localStorage.setItem("wallet_address", address);
      } catch {}

      // 5) Готово: ведемо в «Мої замовлення»
      openBmb({
        kind: "success",
        title: "Вхід виконано",
        subtitle: `Гаманець: ${address.slice(0, 6)}…${address.slice(-4)}`,
        actionLabel: "Перейти",
      });
      navigate("/my-orders");
    } catch (err: any) {
      openBmb({
        kind: "error",
        title: "Помилка MetaMask",
        subtitle: String(err?.message ?? err),
        actionLabel: "OK",
      });
    } finally {
      setPhase("idle");
    }
  }, [refWord, navigate]);

  return (
    <div style={pageWrap}>
      <div style={card}>
        <h1 style={title}>Реєстрація з реферальним кодом</h1>

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
            placeholder="Реферальний код амбасадора"
            style={input}
            autoComplete="one-time-code"
          />

          {/* Реєстрація (обов'язково з рефкодом) */}
          <button
            type="submit"
            disabled={phase === "sending"}
            style={{
              ...btnBlack,
              opacity: phase === "sending" ? 0.7 : 1,
            }}
          >
            Зареєструватися (email + рефкод)
          </button>

          {/* Вхід (тільки email) */}
          <button
            type="button"
            onClick={onLogin}
            disabled={phase === "sending"}
            style={{
              ...btnBlack,
              opacity: phase === "sending" ? 0.7 : 1,
            }}
          >
            Увійти (magic link)
          </button>

          {/* Реєстрація/вхід через MetaMask (рефкод обов'язковий для реєстрації) */}
          <button
            type="button"
            onClick={onWalletLogin}
            disabled={phase === "sending"}
            style={{
              ...btnMetaMask,
              opacity: phase === "sending" ? 0.7 : 1,
            }}
          >
            Продовжити через MetaMask (з рефкодом)
          </button>
        </form>
      </div>
    </div>
  );
}

/* ────────────── стилі ────────────── */
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

const formGrid: React.CSSProperties = { display: "grid", gap: 14 };

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
