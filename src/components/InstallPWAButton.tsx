// src/components/InstallPWAButton.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
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
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  return isIOS && isSafari;
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

  const btnStyle: React.CSSProperties = useMemo(
    () => ({
      display: installed ? "none" : "flex",
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
    }),
    [installed]
  );
  const iconStyle: React.CSSProperties = { width: 24, height: 24, borderRadius: 6 };
  const hintStyle: React.CSSProperties = useMemo(
    () => ({
      display: showIosHint && !installed ? "block" : "none",
      marginTop: 6,
      fontSize: 12,
      color: "#6b7280",
    }),
    [showIosHint, installed]
  );

  useEffect(() => {
    if (installed) return;

    // Уже збережений глобально івент?
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
      try {
        (window as any).__bmbA2HS = bip;
        window.dispatchEvent(new CustomEvent("bmb:a2hs-available"));
      } catch {}
    };

    const onInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
      deferredRef.current = null;
      try { localStorage.setItem("bmb.a2hs.done", "1"); } catch {}
    };

    const onCustom = () => {
      const ev = (window as any).__bmbA2HS as BeforeInstallPromptEvent | undefined;
      if (ev) {
        deferredRef.current = ev;
        setCanInstall(true);
      }
    };

    window.addEventListener("beforeinstallprompt", onBIP as any);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("bmb:a2hs-available", onCustom);

    const t = window.setTimeout(() => {
      if (!deferredRef.current && isIosSafari()) setShowIosHint(true);
    }, 1200);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP as any);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("bmb:a2hs-available", onCustom);
      window.clearTimeout(t);
    };
  }, [installed]);

  const onClick = async () => {
    if (installed) return;
    // Chromium/Android/Desktop
    if (deferredRef.current) {
      try {
        await deferredRef.current.prompt();
        const res = await deferredRef.current.userChoice;
        if (res?.outcome === "accepted") {
          try { localStorage.setItem("bmb.a2hs.done", "1"); } catch {}
          setInstalled(true);
          setCanInstall(false);
          deferredRef.current = null;
          return;
        }
      } catch (err) {
        console.warn("A2HS prompt failed:", err);
      }
    }
    // iOS: показуємо підказку
    if (isIosSafari()) setShowIosHint(true);
  };

  // Якщо ні івента, ні iOS Safari — не показуємо
  const hidden = installed || (!canInstall && !isIosSafari());
  if (hidden) return null;

  return (
    <div className={className}>
      <button type="button" aria-label={label} style={btnStyle} onClick={onClick}>
        <img src={iconSrc} alt="BMB" style={iconStyle} />
        <span>{label}</span>
      </button>

      <div style={hintStyle}>
        На iPhone відкрий меню <strong>Поділитись</strong> і вибери
        <strong> Додати на екран «Додому»</strong>.
      </div>
    </div>
  );
}
