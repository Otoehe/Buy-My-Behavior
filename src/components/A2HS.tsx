// 📄 src/components/A2HS.tsx (mobile-only, real icon, no desktop/PWA/IAB)
import React, { useEffect, useMemo, useRef, useState } from 'react';

declare global {
  interface WindowEventMap {
    beforeinstallprompt: Event;
  }
}

// Нестандартний тип події для Android/Chrome
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PINK = '#ffcdd6';
const BLACK = '#000000';

const DISMISS_UNTIL_KEY = 'bmb.a2hs.dismiss_until';
const FOREVER_KEY = 'bmb.a2hs.never';
const INSTALL_SEEN_KEY = 'bmb.a2hs.seen_count';

function isStandalone() {
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  // @ts-ignore iOS Safari PWA
  if (typeof (navigator as any).standalone === 'boolean' && (navigator as any).standalone) return true;
  return false;
}
function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent || ''); }
function isAndroid() { return /Android/i.test(navigator.userAgent || ''); }
function isMetaMaskInApp() { return /MetaMaskMobile/i.test(navigator.userAgent || ''); }
function isInAppWebView() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Instagram|Line|WeChat|MiuiBrowser|GSA|Gmail|Twitter|VkIntent|wv/i.test(ua);
}
function isMobileUA() {
  // @ts-ignore modern Chromium hint
  const uaDataMobile = navigator.userAgentData && navigator.userAgentData.mobile === true;
  return !!uaDataMobile || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

// Витягнути реальну іконку з маніфеста (пріоритет: maskable, найбільший розмір)
async function pickManifestIcon(): Promise<string | null> {
  try {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const href = (link && link.href) ? link.href : '/manifest.webmanifest';
    const res = await fetch(href, { cache: 'no-store' });
    const manifest = await res.json();
    const icons: Array<{ src: string; sizes?: string; purpose?: string }> = (manifest && manifest.icons) ? manifest.icons : [];

    const parseSize = (s?: string) => {
      if (!s) return 0;
      const parts = s.toLowerCase().split('x').map(p => parseInt(p.trim(), 10)).filter(n => Number.isFinite(n));
      if (parts.length < 2) return 0;
      return Math.max(parts[0], parts[1]);
    };

    icons.sort((a, b) => {
      const am = a.purpose && a.purpose.indexOf('maskable') >= 0 ? 1 : 0;
      const bm = b.purpose && b.purpose.indexOf('maskable') >= 0 ? 1 : 0;
      if (am !== bm) return bm - am;
      return parseSize(b.sizes) - parseSize(a.sizes);
    });

    const best = icons[0];
    if (!best || !best.src) return null;
    const url = new URL(best.src, window.location.origin).toString();
    return url;
  } catch {
    return null;
  }
}

export default function A2HS() {
  const [show, setShow] = useState(false);
  const [iosGuide, setIosGuide] = useState(false);
  const [supported, setSupported] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  const isInstalled = isStandalone();
  const isMobile = isMobileUA();

  const mmDeepLink = useMemo(() => {
    const origin = window.location.origin.replace('https://', '').replace('http://', '');
    const path = window.location.pathname + window.location.search + window.location.hash;
    return 'https://metamask.app.link/dapp/' + origin + path;
  }, []);

  // не показуємо на десктопі, у встановленій PWA, у MetaMask або у вбудованих вебв'ю
  if (!isMobile || isInstalled || isMetaMaskInApp() || isInAppWebView()) return null;

  // не показувати, якщо користувач просив "не питати"
  const neverAsk = useMemo(() => localStorage.getItem(FOREVER_KEY) === '1', []);
  const now = Date.now();
  const dismissUntil = useMemo(() => Number(localStorage.getItem(DISMISS_UNTIL_KEY) || 0), []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const url = await pickManifestIcon();
      if (mounted) setIconUrl(url || '/icons/icon-192.png');
    })();
    const onInstalled = () => { setShow(false); };
    window.addEventListener('appinstalled', onInstalled);
    return () => { mounted = false; window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  useEffect(() => {
    if (neverAsk) return;

    // iOS: немає beforeinstallprompt — показуємо наше вікно з інструкцією
    if (isIOS()) {
      const seenCount = Number(localStorage.getItem(INSTALL_SEEN_KEY) || 0);
      const coolDownOk = dismissUntil < now;
      if (coolDownOk && seenCount < 5) {
        setSupported(true);
        const t = setTimeout(() => setShow(true), 1400);
        return () => clearTimeout(t);
      }
      return;
    }

    // Android / Chrome мобільний
    const handler = (e: Event) => {
      const bip = e as BeforeInstallPromptEvent;
      bip.preventDefault();
      deferredRef.current = bip;
      const coolDownOk = dismissUntil < now;
      if (coolDownOk) {
        setSupported(true);
        setTimeout(() => setShow(true), 1200);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neverAsk, dismissUntil]);

  if (neverAsk) return null;
  // Якщо браузер взагалі не підтримує A2HS — тиша (для iOS supported виставляємо вище)
  if (!supported && !isIOS()) return null;

  function remindLater(days = 3) {
    const until = Date.now() + days * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_UNTIL_KEY, String(until));
    localStorage.setItem(INSTALL_SEEN_KEY, String(Number(localStorage.getItem(INSTALL_SEEN_KEY) || 0) + 1));
    setShow(false);
    setIosGuide(false);
  }

  function neverAskAgain() {
    localStorage.setItem(FOREVER_KEY, '1');
    setShow(false);
    setIosGuide(false);
  }

  async function handleInstallClick() {
    if (isIOS()) { setIosGuide(true); return; }
    const dp = deferredRef.current;
    if (!dp) { setIosGuide(isIOS()); return; }
    await dp.prompt();
    try {
      const choice = await dp.userChoice;
      if (choice.outcome === 'accepted') setShow(false); else remindLater(3);
    } catch { remindLater(3); }
  }

  return (
    <>
      {show && (
        <div style={styles.backdrop} role="dialog" aria-modal="true">
          <div style={styles.card}>
            <div style={styles.iconBox} aria-hidden>
              {iconUrl ? (
                <img src={iconUrl} alt="BMB app icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: PINK }} />
              )}
            </div>
            <h3 style={styles.title}>Додай BMB на головний екран</h3>
            <p style={styles.text}>Так ти відкриватимеш платформу як окремий додаток, а MetaMask працюватиме стабільніше.</p>

            <button style={styles.primaryBtn} onClick={handleInstallClick}>Додати іконку на екран</button>

            {(isAndroid() || isIOS()) && !isMetaMaskInApp() && (
              <a href={mmDeepLink} style={styles.secondaryBtn}>Відкрити в MetaMask</a>
            )}

            <div style={styles.row}>
              <button style={styles.ghostBtn} onClick={() => remindLater(3)}>Нагадати пізніше</button>
              <button style={styles.ghostBtn} onClick={neverAskAgain}>Не питати знову</button>
            </div>
          </div>
        </div>
      )}

      {iosGuide && (
        <div style={styles.backdrop} role="dialog" aria-modal="true" onClick={() => setIosGuide(false)}>
          <div style={styles.card} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.title}>Як додати на iPhone / iPad</h3>
            <ol style={styles.ol}>
              <li>Натисни кнопку <strong>Поділитися</strong> (квадрат зі стрілкою вгору) в Safari.</li>
              <li>Прокрути та обери <strong>"На екран «Додому»"</strong>.</li>
              <li>Підтверди назву і натисни <strong>Додати</strong>.</li>
            </ol>
            <div style={styles.row}>
              <button style={styles.primaryBtn} onClick={() => setIosGuide(false)}>Готово</button>
              <button style={styles.ghostBtn} onClick={() => remindLater(7)}>Нагадати за тиждень</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 1000 },
  card: { width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.15)', padding: 18 },
  iconBox: { width: 56, height: 56, borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', marginBottom: 8 },
  title: { margin: '6px 0 8px', fontSize: 20, fontWeight: 800 },
  text: { margin: '0 0 12px', color: '#444', lineHeight: 1.4 },
  primaryBtn: { display: 'block', width: '100%', textAlign: 'center', background: PINK, color: BLACK, border: 'none', padding: '12px 16px', borderRadius: 12, fontWeight: 800, textDecoration: 'none', marginBottom: 8 },
  secondaryBtn: { display: 'block', width: '100%', textAlign: 'center', background: '#fff', color: BLACK, border: `2px solid ${PINK}`, padding: '10px 16px', borderRadius: 12, fontWeight: 800, textDecoration: 'none', marginBottom: 10 },
  row: { display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4 },
  ghostBtn: { flex: 1, background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px', fontWeight: 700, color: '#333' },
  ol: { margin: '8px 0 12px', paddingLeft: 18, color: '#333' },
};
