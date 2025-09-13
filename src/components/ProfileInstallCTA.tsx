import React from "react";
import InstallPWAButton from "./InstallPWAButton";

/**
 * Центрована секція для CTA встановлення PWA.
 * Нічого не ламає: просто блок у потоці сторінки.
 */
export default function ProfileInstallCTA() {
  const wrapStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 760,              // підженеш під свою ширину контейнера (680/720/800)
    margin: "16px auto 24px",   // по центру
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };
  const btnStretchStyle: React.CSSProperties = {
    width: "100%",
    display: "flex",
    justifyContent: "center",
  };

  return (
    <section aria-label="Install app CTA" style={wrapStyle}>
      <div style={btnStretchStyle}>
        <InstallPWAButton iconSrc="/icons/icon-192.png" />
      </div>
    </section>
  );
}
