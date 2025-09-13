import React, { useEffect, useRef, useState } from "react";

/** Тип події для PWA-встановлення (Chromium-браузери) */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    // @ts-ignore iOS Safari
    (typeof navigator !== "undefined" && (navigator as any).standalone === true)
  );
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua);
}

export default function InstallPWAButton({
  label = "постав мене на робочий стіл",
  className = "",
  iconSrc = "/icons/icon-192.png",
}: { label?: string; className?: string; iconSrc?: string }) {
  const [canInstall, setCanInstall] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return; // вже встановлено — не показуємо кнопку

    const onBIP = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP as any);

    // Якщо подія не прийшла — імовірно iOS Safari → покажемо підказку
    const t = setTimeout(() => {
      if (!deferredRef.current && isIosSafari()) setShowIosHint(true);
    }, 1000);

    const onInstalled = () => setCanInstall(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP as any);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(t);
    };
  }, []);

  const onClick = async () => {
    const ev = deferredRef.current;
    if (!ev) return;
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice.outcome === "accepted") setCanInstall(false);
    } catch {}
  };

  // Нічого не рендеримо, якщо немає що показувати
  if (!canInstall && !showIosHint) return null;

  // Сіра кнопка, тонший напис; іконка з рожевою обводкою та заокругленням
  const btnStyle: React.CSSProperties = {
    display: canInstall ? "inline-flex" : "none",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 16,
    border: "1px solid #d1d5db",
    background: "#f3f4f6",
    color: "#111",
    fontWeight: 600,
    boxShadow: "0 6px 14px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.06)",
    cursor: "pointer",
  };
  const iconStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 6,
    objectFit: "cover",
    boxShadow: "0 1px 2px rgba(0,0,0,.15)",
    border: "2px solid #ff9bb5",
  };
  const hintStyle: React.CSSProperties = {
    display: showIosHint && !canInstall ? "block" : "none",
    fontSize: 13,
    lineHeight: "18px",
    padding: "8px 0",
    opacity: 0.9,
  };

  return (
    <div className={className}>
      <button type="button" aria-label={label} style={btnStyle} onClick={onClick}>
        <img src={iconSrc} alt="BMB" style={iconStyle} />
        <span>{label}</span>
      </button>

      {/* Підказка для iOS Safari */}
      <div style={hintStyle}>
        На iPhone відкрийте меню <strong>Поділитись</strong> і виберіть
        <strong> Додати на екран «Додому»</strong>.
      </div>
    </div>
  );
}
