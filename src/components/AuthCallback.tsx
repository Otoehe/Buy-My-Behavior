// src/components/AuthCallback.tsx
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(loc.search);
        const code = qs.get('code');
        const next = qs.get('next') || localStorage.getItem('post_auth_next') || '/profile';

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const hash = window.location.hash || '';
          if (hash.includes('access_token') || hash.includes('refresh_token')) {
            // @ts-ignore
            const { error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
            if (error) throw error;
          }
        }

        // дочекаємось сесію
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) break;
          await new Promise(r => setTimeout(r, 100));
        }

        try { localStorage.removeItem('post_auth_next'); } catch {}

        // красиво чистимо URL
        try { window.history.replaceState(null, '', next); } catch {}
        navigate(next, { replace: true });
      } catch (e) {
        console.error('Auth callback error', e);
        navigate('/register', { replace: true });
      }
    })();
  }, [loc.search, navigate]);

  return null;
}
