import React, { useEffect, useMemo, useState } from "react";

const BRAND_PINK = "#ffcdd6";
const BRAND_LOGO_SQUARE = "/mUSD-icon.svg"; // квадратний логотип (png/svg у public)

// Тип для події beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// Детекція платформи
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid = () => /android/i.test(navigator.userAgent);
const isStandalone = () =>
  (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false) ||
  ((navigator as any).standalone === true);

export default function AddToHomeProfileCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(isStandalone());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const platform: "ios" | "android" | "other" = useMemo(() => {
    if (isIOS()) return "ios";
    if (isAndroid()) return "android";
    return "other";
  }, []);

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setNote("Готово до встановлення — зʼявиться системне вікно.");
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setNote("Встановлено ✅");
    };
    const onVis = () => setInstalled(isStandalone());

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    document.addEventListener("visibilitychange", onVis);

    // Діагностика, коли промпт не приходить
    const timer = setTimeout(() => {
      if (installed) return;
      if (platform === "ios") {
        setNote("iOS: встановлюється тільки через Safari → Поділитися → Додати на екран.");
      } else if (!deferred) {
        setNote("Промпт недоступний. Відкрий сайт у Chrome напряму; перевір HTTPS / manifest / service worker.");
      }
    }, 1200);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("visibilitychange", onVis);
      clearTimeout(timer);
    };
  }, [installed, platform, deferred]);

  if (installed) return null;

  async function handleInstall() {
    if (busy) return;
    setBusy(true);
    try {
      if (!deferred) {
        // Немає системного промпта — показуємо інструкції під платформу
        if (platform === "ios") {
          alert(
            "iPhone/iPad: Відкрийте сайт у Safari → кнопка ‘Поділитися’ → ‘Додати на початковий екран’ → Підтвердити."
          );
        } else if (platform === "android") {
          alert(
            "Android: У Chrome натисніть ⋮ (три крапки) → ‘Встановити додаток’ або ‘Додати на головний екран’ → Підтвердити."
          );
        } else {
          alert("Відкрийте сайт у Chrome або Safari та встановіть ярлик з меню браузера.");
        }
        return;
      }

      await deferred.prompt();                  // ← показує нативне системне вікно
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setNote("Встановлено ✅");
      } else {
        setNote("Відхилено. Спробуйте через меню браузера: Chrome ⋮ → ‘Встановити додаток’. ");
      }
    } catch {
      setNote("Сталася помилка. Спробуйте через меню браузера: Chrome ⋮ → ‘Встановити додаток’. ");
    } finally {
      setBusy(false);
    }
  }

  // Сіра легка кнопка на всю ширину з квадратним логотипом всередині
  return (
    <div style={{ width: "100%", marginTop: 16 }}>
      <button
        onClick={handleInstall}
        disabled={busy}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          borderRadius: 12,
          background: "#f3f4f6", // світло-сіра кнопка
          border: "1px solid #e5e7eb",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
          opacity: busy ? 0.7 : 1,
        }}
      >
        <img
          src={BRAND_LOGO_SQUARE}
          alt="BMB"
          width={24}
          height={24}
          style={{
            borderRadius: 6,
            background: BRAND_PINK,
            display: "block",
            objectFit: "cover",
          }}
        />
        <span style={{ fontWeight: 800, flex: 1, textAlign: "center", color: "#111827" }}>
          {deferred ? "Встановити (системне вікно)" : platform === "ios" ? "Як встановити на iPhone" : "Як встановити"}
        </span>
      </button>

      {note && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, textAlign: "center", width: "100%" }}>
          {note}
        </div>
      )}
    </div>
  );
}
