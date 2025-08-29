// src/components/AuthCallback.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Props = { next?: string };

function parseNextFromUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    const qNext = url.searchParams.get('next');
    if (qNext) return qNext;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    return hash.get('next');
  } catch { return null; }
}

async function syncReferralOnce(userId: string) {
  try {
    const referred_by = localStorage.getItem('referred_by');
    const referrer_wallet = localStorage.getItem('referrer_wallet');
    if (!referred_by && !referrer_wallet) return;

    const { data: prof } = await supabase
      .from('profiles')
      .select('user_id,referred_by,referrer_wallet')
      .eq('user_id', userId)
      .maybeSingle();

    if (!prof || (!prof.referred_by && !prof.referrer_wallet)) {
      const payload: any = { user_id: userId };
      if (referred_by) payload.referred_by = referred_by;
      if (referrer_wallet) payload.referrer_wallet = referrer_wallet;
      await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
    }
  } catch { /* ignore */ }
}

export default function AuthCallback({ next = '/map' }: Props) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading'|'ok'|'error'>('loading');

  const targetNext = useMemo(() =>
    parseNextFromUrl() || localStorage.getItem('post_auth_next') || next
  , [next]);

  useEffect(() => {
    (async () => {
      try {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          await supabase.auth.exchangeCodeForSession(window.location.href);
          ({ data: { session } } = await supabase.auth.getSession());
        }
        if (session) {
          await syncReferralOnce(session.user.id);  // ← разова синхронізація рефералки
          setStatus('ok');
          window.history.replaceState({}, document.title, targetNext || '/map');
          navigate(targetNext || '/map', { replace: true });
          return;
        }
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
          Помилка авторизації. Спробуйте ще раз або увійдіть вручну.
        </p>
      )}
    </div>
  );
}
