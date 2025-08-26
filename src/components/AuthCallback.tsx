import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    (async () => {
      try {
        // 1) новий шлях: code в query
        if (new URLSearchParams(loc.search).get('code')) {
          const { error } = await supabase.auth.exchangeCodeForSession(loc.search);
          if (error) throw error;
        } else {
          // 2) fallback для старих флоу (hash)
          // @ts-ignore
          if (supabase.auth.getSessionFromUrl) {
            // @ts-ignore
            const { error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
            if (error) throw error;
          }
        }

        // дочекатися, поки сесія точно зʼявиться
        await supabase.auth.getSession();

        const qs = new URLSearchParams(loc.search);
        const next = qs.get('next') || localStorage.getItem('post_auth_next') || '/profile';

        // прибираємо одноразовий маркер
        try { localStorage.removeItem('post_auth_next'); } catch {}

        navigate(next, { replace: true });
      } catch (e) {
        // якщо щось пішло не так — ведемо на /register (але без циклу)
        navigate('/register', { replace: true });
      }
    })();
  }, [loc.search, navigate]);

  return null;
}
