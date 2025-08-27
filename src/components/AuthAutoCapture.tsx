import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthAutoCapture() {
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(window.location.search);
        const code = qs.get('code');
        const next =
          qs.get('next') ||
          localStorage.getItem('post_auth_next') ||
          '/profile';

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            navigate(next, { replace: true });
            return;
          }
        } else if (window.location.hash &&
                  (window.location.hash.includes('access_token') ||
                   window.location.hash.includes('refresh_token'))) {
          // @ts-ignore
          const { error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
          if (!error) {
            navigate(next, { replace: true });
            return;
          }
        }
      } catch {
        /* no-op */
      }
    })();
  }, [loc.key, navigate]);

  return null;
}
