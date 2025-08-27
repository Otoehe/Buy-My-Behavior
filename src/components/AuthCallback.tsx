// src/components/AuthCallback.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const href = window.location.href;

      try {
        // Чи є хоч якісь auth-параметри в URL
        const hasAuth =
          /[?&](code|token_hash|error|error_description)=/.test(href) ||
          href.includes('#access_token');

        if (hasAuth) {
          // Обмін лінка на сесію (працює для code, token_hash і hash)
          const { error } = await supabase.auth.exchangeCodeForSession(href);
          if (error) throw error;
        }

        // дочекаємося появи сесії
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) break;
          await new Promise(r => setTimeout(r, 100));
        }

        // куди далі
        const sp = new URLSearchParams(window.location.search);
        const next =
          sp.get('next') ||
          localStorage.getItem('post_auth_next') ||
          '/map';
        try { localStorage.removeItem('post_auth_next'); } catch {}

        navigate(next, { replace: true });
      } catch (e) {
        console.error('[AuthCallback]', e);
        navigate('/register', { replace: true });
      }
    })();
  }, [navigate]);

  return null;
}
