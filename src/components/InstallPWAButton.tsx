import React, { useEffect, useMemo, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneDisplay =
    window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  // @ts-ignore - iOS Safari
  const iosStandalone = typeof navigator !== "undefined" && (navigator as any).standalone === true;
  return Boolean(standaloneDisplay || iosStandalone);
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = isIOS && !ua.includes("crios") && !ua.includes("fxios") && ua.includes("safari");
  return isIOS && isSafari;
}

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return (
    ua.includes("fbav") ||
    ua.includes("fb_iab") ||
    ua.includes("instagram") ||
    ua.includes("line") ||
    ua.includes("twitter") ||
    ua.includes("telegram") ||
    (ua.includes("mail") && ua.includes("gsa"))
  );
}

type Props = {
  className?: string;
  label?: string;
  iconSrc?: string;
};

export default function InstallPWAButton({
  className = "",
  label = "Додати іконку на головний екран",
  iconSrc = "/icons/icon-192.png",
}: Props) {
  // зберігаємо відкладену BIP-подію, якщо браузер її надіслав
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState<boolean>(() => {
    try {
      if (isStandalone()) return true;
      return localStorage.getItem("bmb.a2hs.done") === "1";
    } catch {
      return isStandalone();
    }
  });
  const [showIosHint, setShowIosHint] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // стилі — бренд #ffcdd6 + чорний
  const btnStyle: React.CSSProperties = useMemo(
    () => ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      width: "100%",
      borderRadius: 16,
      padding: "12px 14px",
      border: "1px solid rgba(0,0,0,.12)",
      background: "#ffcdd6",
      color: "#000",
      fontWeight: 800,
      cursor: "pointer",
      lineHeight: 1.2,
      touchAction: "manipulation",
    }),
    []
  );
  const iconStyle: React.CSSProperties = { width: 24, height: 24, borderRadius: 6 };
  const hintStyle: React.CSSProperties = useMemo(
    () => ({
      marginTop: 6,
      fontSize: 12,
      color: "#6b7280",
    }),
    []
  );

  useEffect(() => {
    if (installed) return;

    // підхоплюємо вже збережену глобально подію (A2HS.tsx її виставляє)
    const existing = (window as any).__bmbA2HS as BeforeInstallPromptEvent | undefined;
    if (existing) {
      deferredRef.current = existing;
      setCanInstall(true);
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      const bip = e as BeforeInstallPromptEvent;
      deferredRef.current = bip;
      setCanInstall(true);
      setMessage(null);
      try {
        (window as any).__bmbA2HS = bip;
        window.dispatchEvent(new CustomEvent("bmb:a2hs-available"));
      } catch {}
    };

    const onInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
      deferredRef.current = null;
      try {
        localStorage.setItem("bmb.a2hs.done", "1");
      } catch {}
    };

    window.addEventListener("beforeinstallprompt", onBIP as any);
    window.addEventListener("appinstalled", onInstalled);

    // iOS — показуємо підказку, навіть якщо BIP відсутній
    const t = window.setTimeout(() => {
      if (isIosSafari()) setShowIosHint(true);
      if (!existing && !isIosSafari() && isInAppBrowser()) {
        setMessage("Відкрийте сайт напряму у Chrome/Safari — тоді з’явиться системний діалог встановлення.");
      }
    }, 900);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP as any);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(t);
    };
  }, [installed]);

  const onClick = async () => {
    if (installed) return;

    // iOS шлях: пояснення
    if (isIosSafari()) {
      setShowIosHint(true);
      return;
    }

    // якщо є відкладений BIP — показуємо системний промпт
    if (deferredRef.current) {
      try {
        setBusy(true);
        await deferredRef.current.prompt();
        const res = await deferredRef.current.userChoice;
        if (res?.outcome === "accepted") {
          try { localStorage.setItem("bmb.a2hs.done", "1"); } catch {}
          setInstalled(true);
          setCanInstall(false);
          deferredRef.current = null;
          return;
        } else {
          setMessage("Можна спробувати пізніше — кнопка лишається тут.");
        }
      } catch (err) {
        setMessage("Не вдалося показати системний промпт. Перевірте HTTPS/manifest/service worker.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // fallback: немає BIP → підказка, що робити
    if (isInAppBrowser()) {
      setMessage("Відкрийте сайт напряму у Chrome/Safari (не через вбудований браузер).");
    } else {
      setMessage("Перевірте HTTPS, наявність manifest.json і активний service worker.");
    }
  };

  // ⚠️ ГОЛОВНА ЗМІНА: більше не ховаємо кнопку, якщо BIP недоступний
  // Раніше було: hidden = installed || (!canInstall && !isIosSafari())
  // Тепер: кнопка видима завжди, поки додаток не встановлено.
  if (installed) return null;

  return (
    <div className={className}>
      <button type="button" aria-label={label} style={btnStyle} onClick={onClick} disabled={busy}>
        <img src={iconSrc} alt="BMB" style={iconStyle} />
        <span>{busy ? "Встановлюємо…" : label}</span>
      </button>

      {/* iOS-підказка */}
      {showIosHint && (
        <div style={hintStyle}>
          На iPhone відкрийте меню <strong>Поділитись</strong> і виберіть
          <strong> Додати на екран «Додому»</strong>.
        </div>
      )}

      {/* Загальні підказки / помилки */}
      {message && <div style={{ ...hintStyle, color: "#444" }}>{message}</div>}
    </div>
  );
}
