import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLocation } from 'react-router-dom';

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }
}

const A2HS: React.FC = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosTip, setIosTip] = useState(false);
  const loc = useLocation();

  // встановлено?
  const installed = () =>
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as any).standalone === true ||
    localStorage.getItem('bmb_installed') === '1';

  useEffect(() => {
    const onInstalled = () => { localStorage.setItem('bmb_installed', '1'); setShow(false); setIosTip(false); };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // показуємо пропозицію лише, коли юзер авторизований і ми на /map або головних екранах
      maybeShow();
    };
    window.addEventListener('beforeinstallprompt', handler as any);
    return () => window.removeEventListener('beforeinstallprompt', handler as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { maybeShow(); /* реагуємо на зміну маршруту */ }, [loc.pathname]);

  async function maybeShow() {
    if (installed()) return setShow(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setShow(false);

    // Android/Chrome шлях
    if (deferred) {
      // показуємо одразу на /map і /profile
      if (loc.pathname === '/map' || loc.pathname === '/profile') setShow(true);
      return;
    }

    // iOS Safari немає beforeinstallprompt — показуємо підказку
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari && (loc.pathname === '/map' || loc.pathname === '/profile')) {
      setIosTip(true);
    }
  }

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      const res = await deferred.userChoice;
      if (res.outcome === 'accepted') {
        localStorage.setItem('bmb_installed', '1');
        setShow(false);
      } else {
        // користувач відмінив — більше не дошкуляємо в цій сесії
        setShow(false);
      }
    } catch {
      setShow(false);
    } finally {
      setDeferred(null);
    }
  };

  const close = () => setShow(false);
  const closeIos = () => setIosTip(false);

  if (installed()) return null;
  if (!show && !iosTip) return null;

  // Простий ненав’язливий тост/банер
  return (
    <div style={wrap}>
      {show && (
        <div style={card}>
          <span>Встановити «BMB» на пристрій?</span>
          <div style={actions}>
            <button onClick={install} style={primary}>Встановити</button>
            <button onClick={close} style={ghost}>Пізніше</button>
          </div>
        </div>
      )}
      {iosTip && (
        <div style={card}>
          <span>Додайте «BMB» на головний екран:  <b>Share</b> → <b>Add to Home Screen</b>.</span>
          <div style={actions}>
            <button onClick={closeIos} style={primary}>Готово</button>
          </div>
        </div>
      )}
    </div>
  );
};

const wrap: React.CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center',
  padding: '0 16px calc(env(safe-area-inset-bottom) + 12px)', zIndex: 999981, pointerEvents: 'none'
};
const card: React.CSSProperties = {
  width: '100%', maxWidth: 460, background: '#fff', border: '1px solid #eee', borderRadius: 16,
  boxShadow: '0 10px 25px rgba(0,0,0,.15)', padding: 12, fontFamily: 'sans-serif', fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'auto'
};
const actions: React.CSSProperties = { display: 'flex', gap: 8 };
const primary: React.CSSProperties = { background: '#000', color: '#fff', border: '1px solid #000', padding: '8px 12px', borderRadius: 12, cursor: 'pointer', fontWeight: 800 };
const ghost: React.CSSProperties = { background: '#fff', border: '1px solid #ddd', padding: '8px 12px', borderRadius: 12, cursor: 'pointer', fontWeight: 800 };

export default A2HS;
