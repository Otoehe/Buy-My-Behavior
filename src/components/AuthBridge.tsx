import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let unsub: any;

    const cleanHash = () => {
      if (location.hash) {
        window.history.replaceState(null, '', location.pathname + location.search);
      }
    };

    (async () => {
      // якщо сесія ВЖЕ є — одразу в профіль
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { cleanHash(); navigate('/profile', { replace: true }); return; }

      // чекаємо на появу сесії після того, як Supabase «з’їсть» hash
      unsub = supabase.auth.onAuthStateChange((_e, s) => {
        if (s) { cleanHash(); navigate('/profile', { replace: true }); }
      }).data.subscription;

      // страховка: якщо токен у hash — даємо трохи часу SDK
      if (location.hash.includes('access_token=')) {
        setTimeout(async () => {
          const { data: { session: s } } = await supabase.auth.getSession();
          if (s) { cleanHash(); navigate('/profile', { replace: true }); }
        }, 800);
      }
    })();

    return () => { try { unsub?.unsubscribe?.(); } catch {} };
  }, [navigate, location]);

  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <h3>Авторизація…</h3>
      <p>Підтверджуємо вхід. Зачекайте кілька секунд.</p>
    </div>
  );
}
