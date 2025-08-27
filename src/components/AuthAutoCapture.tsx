// src/components/AuthAutoCapture.tsx
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Перехоплює лише справжні повернення з листа:
 *  - PKCE: ?code=...
 *  - classic magic link: #access_token=... / #refresh_token=... / #token_hash=...
 *
 * Якщо в URL немає code/токенів — НІЧОГО не робимо (щоб не було циклу редіректів).
 */
export default function AuthAutoCapture() {
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const qs = new URLSearchParams(loc.search);
      const code = qs.get('code');
      const hash = (typeof window !== 'undefined' ? window.location.hash : '') || '';

      const hasHashTokens =
        hash.includes('access_token=') ||
        hash.includes('refresh_token=') ||
        hash.includes('token_hash=');

      const hasCode = !!code;

      // ❗ Нормальна навігація по сайту — нічого не робимо
      if (!hasCode && !hasHashTokens) return;

      try {
        if (hasCode) {
          // PKCE
          const { error } = await supabase.auth.exchangeCodeForSession(code!);
          if (error) throw error;
        } else {
          // Classic magic-link
          // @ts-ignore — метод є у supabase-js v2
          const { error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
          if (error) throw error;

          // прибираємо хеш із URL
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        // гарантуємо, що сесія вже присутня
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) break;
          await new Promise((r) => setTimeout(r, 100));
        }

        const next = qs.get('next') || localStorage.getItem('post_auth_next') || '/profile';
        try { localStorage.removeItem('post_auth_next'); } catch {}

        if (!cancelled) {
          const current = window.location.pathname + window.location.search;
          // уникаємо безглуздого редіректу на ту ж сторінку
          if (!current.startsWith(next)) {
            navigate(next, { replace: true });
          }
        }
      } catch (e) {
        // тихо ігноруємо, аби не ламати маршрутизацію
        console.warn('[AuthAutoCapture] silent error:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [loc.search, navigate]);

  return null;
}
