// src/components/AuthCallback.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Props = {
  next?: string; // куди вести після успішного логіну
};

function parseNextFromUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    const qNext = url.searchParams.get('next');
    if (qNext) return qNext;
    // деякі провайдери кидають фрагментом
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const hNext = hash.get('next');
    return hNext;
  } catch {
    return null;
  }
}

export default function AuthCallback({ next = '/map' }: Props) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading'|'ok'|'error'>('loading');

  const targetNext = useMemo(() => {
    // пріоритет: query/hash next -> localStorage -> prop
    return (
      parseNextFromUrl() ||
      localStorage.getItem('post_auth_next') ||
      next
    );
  }, [next]);

  useEffect(() => {
    (async () => {
      try {
        // 1) якщо сесія вже є — одразу ведемо далі
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // 2) обмінюємо код/токени з URL на сесію (працює і для Magic Link, і для OAuth/PKCE)
          await supabase.auth.exchangeCodeForSession(window.location.href);
          ({ data: { session } } = await supabase.auth.getSession());
        }

        if (session) {
          setStatus('ok');
          // прибираємо сміття з URL
          window.history.replaceState({}, document.title, targetNext || '/map');
          navigate(targetNext || '/map', { replace: true });
          return;
        }

        // Якщо так і не зʼявилась сесія — відправляємо на /register (або сторінку логіну)
        setStatus('error');
        navigate('/register', { replace: true });
      } catch (e) {
        console.error('[AuthCallback] exchange error', e);
        setStatus('error');
        navigate('/register', { replace: true });
      }
    })();
  }, [navigate, targetNext]);

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Завантаження…</h1>
      <p>Підтверджуємо вхід і переносимо на карту “Обрати виконавця”.</p>
      {status === 'error' && (
        <p style={{ color: 'crimson' }}>
          Помилка авторизації. Спробуйте ще раз з вашого листа або увійдіть вручну.
        </p>
      )}
    </div>
  );
}
