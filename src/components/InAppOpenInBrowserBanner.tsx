// 📄 src/components/InAppOpenInBrowserBanner.tsx — PROD (mobile-only, IAB only)
import React, { useEffect, useMemo, useState } from 'react';

const PINK = '#ffcdd6';
const BLACK = '#000000';
const PREF_KEY = 'bmb.open.preferred'; // 'chrome' | 'metamask'

function isAndroid() { return /Android/i.test(navigator.userAgent || ''); }
function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent || ''); }
function isMobileUA() {
  // @ts-ignore UA-CH on Chromium
  const uaDataMobile = navigator.userAgentData?.mobile === true;
  return uaDataMobile || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}
function isStandalonePWA() {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // @ts-ignore iOS Safari
  if (typeof (navigator as any).standalone === 'boolean' && (navigator as any).standalone) return true;
  return false;
}
function isMetaMaskInApp() { return /MetaMaskMobile/i.test(navigator.userAgent || ''); }
function isInAppWebView() {
  const ua = navigator.userAgent || '';
  // common in-app webview signatures (FB/IG/Twitter/Gmail/Line/WeChat/MIUI/GoogleApp/wv)
  return /FBAN|FBAV|FB_IAB|Instagram|Line|WeChat|MiuiBrowser|GSA|Gmail|Twitter|VkIntent|wv/i.test(ua);
}

export default function InAppOpenInBrowserBanner() {
  // HARD guard: do not render except on mobile AND in-app webviews (not PWA, not MetaMask)
  if (!isMobileUA() || isStandalonePWA() || isMetaMaskInApp() || !isInAppWebView()) {
    return null;
  }

  const [show, setShow] = useState(false);

  const originHost = window.location.origin.replace(/^https?:\/\//, '');
  const path = window.location.pathname + window.location.search + window.location.hash;
  const plainUrl = window.location.href;

  const chromeIntent = useMemo(() => {
    if (!isAndroid()) return null;
    const scheme = window.location.protocol.replace(':', '');
    return `intent://${originHost}${path}#Intent;scheme=${scheme};package=com.android.chrome;end`;
  }, [originHost, path]);

  const metamaskDeepLink = useMemo(() => {
    return `https://metamask.app.link/dapp/${originHost}${path}`;
  }, [originHost, path]);

  useEffect(() => {
    const pref = localStorage.getItem(PREF_KEY);
    if (pref === 'metamask') {
      window.location.href = metamaskDeepLink;
      return;
    }
    if (pref === 'chrome') {
      if (chromeIntent) {
        window.location.href = chromeIntent;
      } else {
        // iOS: best we can do from IAB is open new tab/window
        const a = document.createElement('a');
        a.href = plainUrl; a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
      }
      return;
    }
    // no preference yet -> show banner once
    setShow(true);
  }, [chromeIntent, metamaskDeepLink, plainUrl]);

  if (!show) return null;

  const browserBtnText = isAndroid() ? 'Завжди відкривати в Chrome' : 'Завжди відкривати в Safari';

  function choose(pref: 'chrome' | 'metamask') {
    localStorage.setItem(PREF_KEY, pref);
    setShow(false);
    if (pref === 'metamask') {
      window.location.href = metamaskDeepLink;
    } else {
      if (chromeIntent) {
        window.location.href = chromeIntent;
      } else {
        const a = document.createElement('a');
        a.href = plainUrl; a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
      }
    }
  }

  return (
    <div style={styles.wrap} role="region" aria-label="Open in browser banner">
      <div style={styles.headerBox}>
        <div style={styles.title}>Обери спосіб відкриття один раз</div>
        <div style={styles.text}>Вбудований переглядач обмежує MetaMask. Зроби вибір - я запам'ятаю його і більше не турбуватиму.</div>
      </div>

      <button style={styles.primaryBtn} onClick={() => choose('chrome')}>{browserBtnText}</button>
      <a href={metamaskDeepLink} onClick={(e) => { e.preventDefault(); choose('metamask'); }} style={styles.secondaryBtn}>Завжди відкривати у MetaMask</a>

      {isIOS() && (
        <div style={styles.hint}>iOS: у меню ... обери 'Open in Safari'.</div>
      )}

      <div style={styles.note}>Після вибору цей банер більше не показується.</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    background: '#fff',
    border: `2px solid ${PINK}`,
    borderRadius: 16,
    padding: 12,
    display: 'grid',
    gap: 10,
    boxShadow: '0 10px 35px rgba(0,0,0,0.08)',
    margin: '12px 0 16px',
  },
  headerBox: { textAlign: 'center' },
  title: { fontWeight: 800, fontSize: 18, lineHeight: 1.15, marginBottom: 6 },
  text: { fontSize: 14, color: '#333', lineHeight: 1.45, maxWidth: '46ch', margin: '0 auto' },
  primaryBtn: {
    display: 'block', width: '100%', textAlign: 'center', background: PINK, color: BLACK, border: 'none', padding: '12px 14px', borderRadius: 12, fontWeight: 800, textDecoration: 'none',
  },
  secondaryBtn: {
    display: 'block', width: '100%', textAlign: 'center', background: '#fff', color: BLACK, border: `2px solid ${PINK}`, padding: '10px 14px', borderRadius: 12, fontWeight: 800, textDecoration: 'none',
  },
  hint: { fontSize: 12.5, color: '#666', textAlign: 'center' },
  note: { fontSize: 12, color: '#8a8a8a', textAlign: 'center' },
};
