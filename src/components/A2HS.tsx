// 📄 src/components/A2HS.tsx
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
  // PWA вже встановлена
  // Chrome/Edge:
  // @ts-ignore
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari:
  // @ts-ignore
  if (typeof (navigator as any).standalone === 'boolean' && (navigator as any).standalone) return true;
  return false;
}

function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua);
}

function isAndroid() {
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua);
}

function isMetaMaskInApp() {
  const ua = navigator.userAgent || '';
  // У MetaMask власний браузер, там теж можна працювати, але A2HS не актуальний
  return /MetaMaskMobile/i.test(ua);
}

function isInAppWebView() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Instagram|Line|WeChat|MiuiBrowser|GSA|Gmail|Twitter|VkIntent|wv/i.test(ua);
}

export default function A2HS() {
  const [show, setShow] = useState(false);
  const [iosGuide, setIosGuide] = useState(false);
  const [supported, setSupported] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  const [isInstalled, setIsInstalled] = useState(isStandalone());

  const mmDeepLink = useMemo(() => {
    const origin = window.location.origin.replace(/^https?:\/\//, '');
    const path = window.location.pathname + window.location.search + window.location.hash;
    return `https://metamask.app.link/dapp/${origin}${path}`;
  }, []);

  // не показувати, якщо користувач просив "не питати"
  const neverAsk = useMemo(() => localStorage.getItem(FOREVER_KEY) === '1', []);
  const now = Date.now();
  const dismissUntil = useMemo(() => Number(localStorage.getItem(DISMISS_UNTIL_KEY) || 0), []);

  useEffect(() => {
    const onInstalled = () => setIsInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  useEffect(() => {
    if (isInstalled || neverAsk) return;

    // iOS: немає beforeinstallprompt — покажемо наше вікно з інструкцією
    if (isIOS()) {
      // У вбудованих вебв’ю A2HS не має сенсу
      if (isInAppWebView()) return;

      const seenCount = Number(localStorage.getItem(INSTALL_SEEN_KEY) || 0);
      // не частіше 1 разу на 3 дні, і лише після першої успішної авторизації (припускаємо, що юзер уже в апці)
      const coolDownOk = dismissUntil < now;
      if (coolDownOk && seenCount < 5) {
        setSupported(true);
        // невелика пауза щоб не мигати одразу після навігації
        const t = setTimeout(() => setShow(true), 1400);
        return () => clearTimeout(t);
      }
      return;
    }

    // Android / Chrome
    const handler = (e: Event) => {
      const bip = e as BeforeInstallPromptEvent;
      bip.preventDefault(); // блокуємо дефолт, збережемо подію для виклику пізніше
      deferredRef.current = bip;
      // У вбудованих вебв’ю пропускаємо
      if (isInAppWebView()) return;

      const coolDownOk = dismissUntil < now;
      if (coolDownOk) {
        setSupported(true);
        setTimeout(() => setShow(true), 1200);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstalled, neverAsk, dismissUntil]);

  if (isInstalled || neverAsk || isMetaMaskInApp()) return null; // у MetaMask браузері A2HS не актуальний

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
    if (isIOS()) {
      // Показати гайд для iOS
      setIosGuide(true);
      return;
    }
    const dp = deferredRef.current;
    if (!dp) {
      // Немає події — можливо браузер не підтримує або вже встановлено
      setIosGuide(isIOS());
      return;
    }
    await dp.prompt();
    try {
      const choice = await dp.userChoice;
      if (choice.outcome === 'accepted') {
        setShow(false);
      } else {
        remindLater(3);
      }
    } catch {
      remindLater(3);
    }
  }

  // Якщо браузер взагалі не підтримує A2HS — тиша
  if (!supported && !isIOS()) return null;

  return (
    <>
      {show && (
        <div style={styles.backdrop} role="dialog" aria-modal="true">
          <div style={styles.card}>
            <div style={styles.logo}>B<span style={{ color: BLACK }}>M</span>B</div>
            <h3 style={styles.title}>Додай BMB на головний екран</h3>
            <p style={styles.text}>
              Так ти відкриватимеш платформу як окремий додаток, а MetaMask працюватиме стабільніше.
            </p>

            <button style={styles.primaryBtn} onClick={handleInstallClick}>
              Додати іконку на екран
            </button>

            {(isAndroid() || isIOS()) && !isMetaMaskInApp() && (
              <a href={mmDeepLink} style={styles.secondaryBtn}>
                Відкрити в MetaMask
              </a>
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
              <li>Прокрути та обери <strong>“На екран «Додому»”</strong>.</li>
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
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'grid',
    placeItems: 'center',
    padding: '16px',
    zIndex: 1000,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    background: '#fff',
    borderRadius: 18,
    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
    padding: 18,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: PINK,
    color: BLACK,
    display: 'grid',
    placeItems: 'center',
    fontWeight: 900,
    marginBottom: 8,
    userSelect: 'none',
  },
  title: { margin: '6px 0 8px', fontSize: 20, fontWeight: 800 },
  text: { margin: '0 0 12px', color: '#444', lineHeight: 1.4 },
  primaryBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    background: PINK,
    color: BLACK,
    border: 'none',
    padding: '12px 16px',
    borderRadius: 12,
    fontWeight: 800,
    textDecoration: 'none',
    marginBottom: 8,
  },
  secondaryBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    background: '#fff',
    color: BLACK,
    border: `2px solid ${PINK}`,
    padding: '10px 16px',
    borderRadius: 12,
    fontWeight: 800,
    textDecoration: 'none',
    marginBottom: 10,
  },
  row: {
    display: 'flex',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 4,
  },
  ghostBtn: {
    flex: 1,
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: 10,
    padding: '10px 12px',
    fontWeight: 700,
    color: '#333',
  },
  ol: {
    margin: '8px 0 12px',
    paddingLeft: 18,
    color: '#333',
  },
};
