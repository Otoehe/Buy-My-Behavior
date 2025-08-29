import React, { useEffect, useMemo, useState } from "react";

// Brand colors
const PINK = "#ffcdd6";
const BLACK = "#000000";

// Canvas-only: always show the banner here for preview. Do NOT copy this flag to prod.
const PREVIEW = true;

// LocalStorage key
const PREF_KEY = "bmb.open.preferred"; // 'chrome' | 'metamask'

function isInAppWebView() {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|FB_IAB|Instagram|Line|WeChat|MiuiBrowser|GSA|Gmail|Twitter|VkIntent|wv/i.test(ua);
}
function isMetaMaskInApp() {
  return /MetaMaskMobile/i.test(navigator.userAgent || "");
}
function isAndroid() {
  return /Android/i.test(navigator.userAgent || "");
}
function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

// --- Tests helpers (kept simple; ASCII only in strings) ---
function hasUnsafeApostrophes(s) {
  // U+02BC (\u02BC), U+2019 (\u2019), U+2018 (\u2018)
  return /[\u02BC\u2019\u2018]/.test(s);
}

// ✅ FIX APPLIED: proper component declaration (no extra parentheses)
export default function InAppOpenInBrowserBanner() {
  const [show, setShow] = useState(false);
  const platform = PREVIEW ? "android" : (isAndroid() ? "android" : "ios");

  // Current URL pieces
  const plainUrl = window.location.href;
  const originHost = window.location.origin.replace(/^https?:\/\//, "");
  const path = window.location.pathname + window.location.search + window.location.hash;

  const chromeIntent = useMemo(() => {
    if (!isAndroid()) return null;
    const scheme = window.location.protocol.replace(":", "");
    return `intent://${originHost}${path}#Intent;scheme=${scheme};package=com.android.chrome;end`;
  }, [originHost, path]);

  const mmDeepLink = useMemo(
    () => `https://metamask.app.link/dapp/${originHost}${path}`,
    [originHost, path]
  );

  // Auto-redirect if preference exists
  useEffect(() => {
    if (PREVIEW) { setShow(true); return; }
    const iab = isInAppWebView();
    if (!iab || isMetaMaskInApp()) return;

    const pref = localStorage.getItem(PREF_KEY);
    if (!pref) { setShow(true); return; }

    if (pref === "metamask") {
      window.location.href = mmDeepLink;
      return;
    }
    if (pref === "chrome") {
      if (chromeIntent) {
        window.location.href = chromeIntent; // Android -> Chrome
      } else {
        // iOS: open same URL in a new Safari tab
        const a = document.createElement("a");
        a.href = plainUrl;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return;
    }
  }, [chromeIntent, mmDeepLink, plainUrl]);

  // In Canvas we always show. In prod we respect environment.
  if (!PREVIEW && (!show || !isInAppWebView() || isMetaMaskInApp())) return null;

  const browserBtnText = platform === "android" ? "Завжди відкривати в Chrome" : "Завжди відкривати в Safari";

  function choose(pref) {
    localStorage.setItem(PREF_KEY, pref);
    if (pref === "metamask") {
      window.location.href = mmDeepLink;
    } else {
      if (chromeIntent) {
        window.location.href = chromeIntent;
      } else {
        const a = document.createElement("a");
        a.href = plainUrl;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
  }

  // --- Minimal tests (rendered below for visual confirmation) ---
  const tests = PREVIEW ? [
    { name: "ASCII apostrophe is safe", input: "запам'ятається", expectUnsafe: false, got: hasUnsafeApostrophes("запам'ятається") },
    { name: "Typographic \u2019 flagged", input: "з’являтиметься", expectUnsafe: true, got: hasUnsafeApostrophes("з’являтиметься") },
    { name: "Modifier \u02BC flagged", input: "запамʼятається", expectUnsafe: true, got: hasUnsafeApostrophes("запамʼятається") },
    { name: "ASCII English ok", input: "it's ASCII only", expectUnsafe: false, got: hasUnsafeApostrophes("it's ASCII only") },
    { name: "Component is a function", input: "typeof component === 'function'", expectUnsafe: false, got: typeof InAppOpenInBrowserBanner !== 'function' },
  ] : null;

  return (
    <div style={styles.wrap} role="region" aria-label="Open in browser banner">
      <div style={styles.headerBox}>
        <div style={styles.title}>Обери спосіб відкриття один раз</div>
        <div style={styles.text}>
          Вбудований переглядач обмежує MetaMask. Зроби вибір - я запам'ятаю його і більше не турбуватиму.
        </div>
      </div>

      <button style={styles.primaryBtn} onClick={() => choose("chrome")}>
        {browserBtnText}
      </button>

      <a href={mmDeepLink} onClick={(e) => { e.preventDefault(); choose("metamask"); }} style={styles.secondaryBtn}>
        Завжди відкривати у MetaMask
      </a>

      {platform === "ios" && (
        <div style={styles.hint}>iOS: у меню ... обери "Open in Safari".</div>
      )}

      <div style={styles.note}>Після вибору цей банер більше не показується.</div>

      {PREVIEW && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Inline tests</summary>
          <pre style={{ fontSize: 11, background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 8, marginTop: 6 }}>
{JSON.stringify(tests, null, 2)}
          </pre>
          <div style={{ fontSize: 12, color: '#666' }}>Очікування: тільки рядки з не-ASCII апострофами мають позначатися як unsafe: true.</div>
        </details>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    background: "#fff",
    border: `2px solid ${PINK}`,
    borderRadius: 16,
    padding: 12,
    display: "grid",
    gap: 10,
    boxShadow: "0 10px 35px rgba(0,0,0,0.08)",
    margin: "12px 0 16px",
  },
  headerBox: { textAlign: "center" },
  title: { fontWeight: 800, fontSize: 18, lineHeight: 1.15, marginBottom: 6 },
  text: { fontSize: 14, color: "#333", lineHeight: 1.45, maxWidth: "46ch", margin: "0 auto" },
  primaryBtn: {
    display: "block",
    width: "100%",
    textAlign: "center",
    background: PINK,
    color: BLACK,
    border: "none",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 800,
    textDecoration: "none",
  },
  secondaryBtn: {
    display: "block",
    width: "100%",
    textAlign: "center",
    background: "#fff",
    color: BLACK,
    border: `2px solid ${PINK}`,
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
    textDecoration: "none",
  },
  hint: { fontSize: 12.5, color: "#666", textAlign: "center" },
  note: { fontSize: 12, color: "#8a8a8a", textAlign: "center" },
};
