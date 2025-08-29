import React, { useEffect, useMemo, useState } from 'react';

const PINK = '#ffcdd6';
const BLACK = '#000000';

// localStorage ключ із вибором користувача
const PREF_KEY = 'bmb.open.preferred'; // 'chrome' | 'metamask'

function isInAppWebView() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Instagram|Line|WeChat|MiuiBrowser|GSA|Gmail|Twitter|VkIntent|wv/i.test(ua);
}
function isMetaMaskInApp() {
  return /MetaMaskMobile/i.test(navigator.userAgent || '');
}
function isAndroid() {
  return /Android/i.test(navigator.userAgent || '');
}
function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

export default function InAppOpenInBrowserBanner() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios'>(isAndroid() ? 'android' : 'ios');

  // поточні посилання
  const plainUrl = window.location.href;
  const originHost = window.location.origin.replace(/^https?:\/\//, '');
  const path = window.location.pathname + window.location.search + window.location.hash;

  const chromeIntent = useMemo(() => {
    if (!isAndroid()) return null;
    const scheme = window.location.protocol.replace(':', '');
    return `intent://${originHost}${path}#Intent;scheme=${scheme};package=com.android.chrome;end`;
  }, [originHost, path]);

  const mmDeepLink = useMemo(
    () => `https://metamask.app.link/dapp/${originHost}${path}`,
    [originHost, path]
  );

  // Якщо є обраний варіант — робимо авторедірект без банера
  useEffect(() => {
    const iab = isInAppWebView();
    if (!iab || isMetaMaskInApp()) return;

    const pref = localStorage.getItem(PREF_KEY);
    if (!pref) {
      setShow(true); // показати банер лише один раз
      return;
    }

    // авторедірект
    if (pref === 'metamask') {
      window.location.href = mmDeepLink;
      return;
    }
    if (pref === 'chrome') {
      if (chromeIntent) {
        window.location.href = chromeIntent; // Android → Chrome
      } else {
        // iOS: відкриваємо у новій вкладці (далі юзер натискає «Open in Safari»)
        const a = document.createElement('a');
        a.href = plainUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return;
    }
  }, [chromeIntent, mmDeepLink, plainUrl]);

  if (!show || !isInAppWebView() || isMetaMaskInApp()) return null;

  const browserBtnText = platform === 'android' ? 'Завжди відкривати в Chrome' : 'Завжди відкривати в Safari';

  function choose(pref: 'chrome' | 'metamask') {
    localStorage.setItem(PREF_KEY, pref);
    // одразу виконуємо редірект
    if (pref === 'metamask') {
      window.location.href = mmDeepLink;
    } else {
      if (chromeIntent) {
        window.location.href = chromeIntent;
      } else {
        const a = document.createElement('a');
        a.href = plainUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
  }

  return (
    <div style={styles.wrap} role="region" aria-label="Open in browser banner">
      <div style={styles.headerRow}>
        {/* логотип — дві арки на рожевому */}
        <div style={styles.logoBox} aria-hidden>
          <svg width="56" height="56" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="100" height="100" rx="16" fill={PINK} />
            <path d="M20 60 Q35 35 50 60 M50 60 Q65 35 80 60"
              fill="none" stroke={BLACK} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ alignSelf: 'center' }}>
          <div style={styles.title}>Обери спосіб відкриття один раз</div>
          <div style={styles.text}>
            Вбудований переглядач обмежує MetaMask. Зроби вибір — я запам’ятаю його і більше не турбуватиму.
          </div>
        </div>
      </div>

      <button style={styles.primaryBtn} onClick={() => choose('chrome')}>
        {browserBtnText}
      </button>

      <a href={mmDeepLink} onClick={(e) => { e.preventDefault(); choose('metamask'); }} style={styles.secondaryBtn}>
        Завжди відкривати у MetaMask
      </a>

      {platform === 'ios' && (
        <div style={styles.hint}>
          iOS: натисни <b>•••</b> у правому верхньому куті → <b>Open in Safari</b>.
        </div>
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
  headerRow: {
    display: 'grid',
    gridTemplateColumns: '56px 1fr',
    gap: 12,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
  },
  title: { fontWeight: 800, fontSize: 16, marginBottom: 4 },
  text: { fontSize: 13.5, color: '#333', lineHeight: 1.35 },
  primaryBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    background: PINK,
    color: BLACK,
    border: 'none',
    padding: '12px 14px',
    borderRadius: 12,
    fontWeight: 800,
    textDecoration: 'none',
  },
  secondaryBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    background: '#fff',
    color: BLACK,
    border: `2px solid ${PINK}`,
    padding: '10px 14px',
    borderRadius: 12,
    fontWeight: 800,
    textDecoration: 'none',
  },
  hint: {
    fontSize: 12.5,
    color: '#666',
  },
  note: {
    fontSize: 12,
    color: '#8a8a8a',
  },
};
