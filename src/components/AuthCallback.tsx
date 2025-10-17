import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * AuthCallback — обробляє повернення з магік-лінка.
 * - Дає Supabase час закріпити сесію (secure cookie на HTTPS)
 * - Робить кілька спроб getUser() з невеликими паузами
 * - Якщо користувач є → ведемо на /map (Обрати виконавця)
 * - Якщо помилка в параметрах → показуємо коротке повідомлення і ведемо на /register
 * - Очищає URL від токенів/фрагментів
 */

const WAIT_STEPS_MS = [150, 300, 500, 800, 1200, 1500]; // ~4.5s сумарно

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [msg, setMsg] = useState('Завершуємо вхід…');

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const hasError = query.get('error_description') || query.get('error');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (hasError) {
          console.warn('Auth callback error:', hasError);
          if (!cancelled) {
            setMsg('Не вдалось увійти. Спробуйте ще раз.');
            await new Promise(r => setTimeout(r, 600));
            navigate('/register', { replace: true });
          }
          return;
        }

        for (let i = 0; i < WAIT_STEPS_MS.length; i++) {
          if (cancelled) return;
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            if (!cancelled) {
              const cleanUrl = window.location.pathname;
              window.history.replaceState({}, '', cleanUrl);
              navigate('/map', { replace: true });
            }
            return;
          }
          setMsg(i < 2 ? 'Підтверджуємо вхід…' : 'Будь ласка, зачекайте…');
          await new Promise(r => setTimeout(r, WAIT_STEPS_MS[i]));
        }

        if (!cancelled) {
          setMsg('Потрібна повторна авторизація.');
          await new Promise(r => setTimeout(r, 400));
          navigate('/register', { replace: true });
        }
      } catch (e) {
        console.error('AuthCallback exception', e);
        if (!cancelled) {
          setMsg('Сталася помилка авторизації.');
          await new Promise(r => setTimeout(r, 400));
          navigate('/register', { replace: true });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [navigate, hasError]);

  return (
    <div style={{
      height: '100vh',
      display: 'grid',
      placeItems: 'center',
      fontSize: 16,
      lineHeight: 1.5,
      padding: 24
    }}>
      <div>{msg}</div>
    </div>
  );
}
