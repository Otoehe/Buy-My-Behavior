// 📄 src/components/A2HS.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';

declare global {
  interface Window {
    __bmbA2HS?: BeforeInstallPromptEvent | null;
  }
  interface WindowEventMap {
    beforeinstallprompt: Event;
    appinstalled: Event;
    'bmb:a2hs-available': CustomEvent<undefined>;
    'bmb:a2hs-installed': CustomEvent<undefined>;
  }
}

// Нестандартний тип для Chrome/Chromium
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PINK = '#ffcdd6';
const BLACK = '#000000';

const DISMISS_UNTIL_KEY = 'bmb.a2hs.dismiss_until';
const FOREVER_KEY = 'bmb.a2hs.never';
const SEEN_COUNT_KEY = 'bmb.a2hs.seen_count';

function now() { return Date.now(); }

function isStandalone(): boolean {
  const mm = (window as any).matchMedia;
  if (mm && mm('(display-mode: standalone)').matches) return true;
  // @ts-ignore iOS Safari legacy
  if (typeof navigator !== 'undefined' && (navigator as any).standalone === true) return true;
  return false;
}

function isAndroidChrome(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('android') && ua.includes('chrome') && !ua.includes('wv');
}

function isChromiumDesktop(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const isChromium =
    ua.includes('chrome') || ua.includes('edg') || ua.includes('opr') || ua.includes('brave');
  const isMobile = /iphone|ipad|ipod|android/i.test(ua);
  return isChromium && !isMobile;
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = isIOS && !ua.includes('crios') && !ua.includes('fxios') && ua.includes('safari');
  return isIOS && isSafari;
}

function isInAppBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return (
    ua.includes('fbav') ||
    ua.includes('fb_iab') ||
    ua.includes('instagram') ||
    ua.includes('line') ||
    ua.includes('twitter') ||
    ua.includes('telegram') ||
    (ua.includes('mail') && ua.includes('gsa')) // Gmail/Google apps
  );
}

export default function A2HS() {
  const [bipEvent, setBipEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<boolean>(isStandalone());
  const seenRef = useRef(0);

  // ⛳️ Робимо блок доступним на Android Chromium, Desktop Chromium та iOS Safari (інструкція)
  const shouldRender = useMemo(() => {
    if (installed) return false;
    return isAndroidChrome() || isChromiumDesktop() || isIosSafari();
  }, [installed]);

  // Правила відкладення/заборони показу
  useEffect(() => {
    if (installed) {
      try { localStorage.setItem(FOREVER_KEY, '1'); } catch {}
      setEligible(false);
      return;
    }
    try {
      seenRef.current = Number(localStorage.getItem(SEEN_COUNT_KEY) || '0');
      const dismissUntil = Number(localStorage.getItem(DISMISS_UNTIL_KEY) || '0');
      const never = localStorage.getItem(FOREVER_KEY) === '1';
      if (never) return setEligible(false);
      if (dismissUntil && now() < dismissUntil) return setEligible(false);
      setEligible(true);
    } catch {
      setEligible(true);
    }
  }, [installed]);

  // Ловимо beforeinstallprompt, експортуємо глобально, реагуємо на встановлення
  useEffect(() => {
    if (!shouldRender) return;

    // Якщо хтось уже зберіг відкладену подію — підхоплюємо
    if (window.__bmbA2HS) {
      setBipEvent(window.__bmbA2HS);
      setError(null);
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      const ev = e as BeforeInstallPromptEvent;
      window.__bmbA2HS = ev;              // <- робимо доступним глобально
      setBipEvent(ev);
      setError(null);
      try { window.dispatchEvent(new CustomEvent('bmb:a2hs-available')); } catch {}
    };

    const onInstalled = () => {
      try { localStorage.setItem(FOREVER_KEY, '1'); } catch {}
      window.__bmbA2HS = null;
      setBipEvent(null);
      setEligible(false);
      setInstalled(true);
      try { window.dispatchEvent(new CustomEvent('bmb:a2hs-installed')); } catch {}
    };

    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [shouldRender]);

  if (!shouldRender) return null;
  if (!eligible) return null;

  const promptUnavailable = !bipEvent && !isIosSafari(); // на iOS промпта немає — показуємо інструкцію

  const onInstallClick = async () => {
    // iOS: показуємо інструкцію замість системного промпта
    if (isIosSafari()) {
      setError('На iOS: натисніть Поділитись → Додати на екран «Додому».');
      return;
    }

    if (!bipEvent) {
      setError(
        'Промпт недоступний. Відкрий сайт напряму у Chromium-браузері; перевір HTTPS / manifest / service worker.'
      );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await bipEvent.prompt();
      const choice = await bipEvent.userChoice;
      try {
        const next = (seenRef.current || 0) + 1;
        localStorage.setItem(SEEN_COUNT_KEY, String(next));
        if (choice.outcome === 'dismissed') {
          const until = now() + 24 * 60 * 60 * 1000; // доба
          localStorage.setItem(DISMISS_UNTIL_KEY, String(until));
        } else {
          localStorage.setItem(FOREVER_KEY, '1'); // прийнято — більше не показувати
        }
      } catch {}
      setEligible(false); // дочекаємось appinstalled або просто сховаємось
    } catch (err: any) {
      setError(err?.message || 'Не вдалося показати промпт.');
    } finally {
      setBusy(false);
    }
  };

  const onHideForWeek = () => {
    try {
      const until = now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_UNTIL_KEY, String(until));
    } catch {}
    setEligible(false);
  };

  const onNever = () => {
    try { localStorage.setItem(FOREVER_KEY, '1'); } catch {}
    setEligible(false);
  };

  return (
    <div
      style={{
        marginTop: 16,
        borderRadius: 16,
        background: '#fff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        padding: 16,
        border: `1px solid ${PINK}`,
      }}
      role="region"
      aria-label="Додати додаток BMB на головний екран"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Квадратний логотип (можеш замінити на /icons/icon-192.png) */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: '#f3f3f3',
            border: '1px solid #e5e5e5',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
          }}
        >
          <img
            src="/mUSD-icon.svg"
            alt="BMB"
            style={{ width: 36, height: 36 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: BLACK, marginBottom: 4 }}>
            Додати іконку на головний екран
          </div>
          {isIosSafari() ? (
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              На iPhone: <strong>Поділитись</strong> → <strong>Додати на екран «Додому»</strong>.
            </div>
          ) : promptUnavailable ? (
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Промпт недоступний.
              {isInAppBrowser()
                ? ' Відкрийте сайт у Chrome/Edge/Opera напряму (не через вбудований браузер).'
                : ' Переконайтесь у HTTPS, валідному manifest і активному service worker.'}
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Натисніть і підтвердьте у системному діалозі — ярлик з’явиться на робочому столі.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={onInstallClick}
          disabled={busy}
          style={{
            flex: 1,
            border: '1px solid #d9d9d9',
            background: '#f3f3f3',
            color: '#111',
            padding: '12px 14px',
            borderRadius: 999,
            fontWeight: 600,
          }}
        >
          {busy ? 'Встановлюємо…' : isIosSafari() ? 'Як додати?' : 'Додати іконку'}
        </button>
        <button
          onClick={onHideForWeek}
          style={{
            border: '1px solid transparent',
            background: 'transparent',
            color: '#666',
            padding: '12px 10px',
            borderRadius: 12,
          }}
          aria-label="Сховати на тиждень"
          title="Сховати на тиждень"
        >
          Пізніше
        </button>
        <button
          onClick={onNever}
          style={{
            border: '1px solid transparent',
            background: 'transparent',
            color: '#999',
            padding: '12px 10px',
            borderRadius: 12,
          }}
          aria-label="Більше не показувати"
          title="Більше не показувати"
        >
          Не показувати
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#b00020' }} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
