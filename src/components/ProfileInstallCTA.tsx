import React from "react";
import InstallPWAButton from "./InstallPWAButton";

export default function ProfileInstallCTA() {
  const wrapStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 760,
    margin: "16px auto 24px",
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
