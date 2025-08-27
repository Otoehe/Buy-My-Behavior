// src/components/AuthAutoCapture.tsx
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Автоматично перехоплює повернення з листа:
 * - новий PKCE флоу:  ?code=...
 * - класичний magic link: #access_token=... або #token_hash=...
 * Після успішного обміну переводить на next (якщо був), інакше /profile.
 */
export default function AuthAutoCapture() {
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(loc.search);
        const code = qs.get('code');                      // PKCE
        const next = qs.get('next') ||
          localStorage.getItem('post_auth_next') || '/profile';

        const hash = window.location.hash || '';

        // 1) Новий PKCE флоу (лист містить ?code=...)
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          // прибираємо одноразовий маркер
          try { localStorage.removeItem('post_auth_next'); } catch {}
          navigate(next, { replace: true });
          return;
        }

        // 2) Класичний magic-link (лист не містить ?code, але має #access_token / #refresh_token / #token_hash)
        if (hash.includes('access_token=') ||
            hash.includes('refresh_token=') ||
            hash.includes('token_hash=')) {
          // читає токени з хеша та зберігає сесію
          // @ts-ignore — метод присутній у supabase-js v2
          const { error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
          if (error) throw error;

          try { localStorage.removeItem('post_auth_next'); } catch {}
          navigate(next, { replace: true });
          return;
        }

        // 3) Якщо вже є сесія (користувач клікнув старе посилання і сторінка перевантажилась)
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          navigate(next, { replace: true });
          return;
        }
      } catch (e) {
        // тихо ігноруємо — нехай роутер працює далі
        // console.warn('AuthAutoCapture:', e);
      }
    })();
  }, [loc.search, navigate]);

  return null;
}
