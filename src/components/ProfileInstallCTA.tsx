// src/components/ProfileInstallCTA.tsx
import React from "react";
import InstallPWAButton from "./InstallPWAButton";

/**
 * Встав у Profile.tsx у місці, де має бути кнопка A2HS, наприклад:
 * <section className="profile-install-cta"><ProfileInstallCTA /></section>
 */
export default function ProfileInstallCTA() {
  return (
    <div className="w-full max-w-xl">
      <InstallPWAButton className="profile-install-cta" iconSrc="/icons/icon-192.png" />
    </div>
  );
}
