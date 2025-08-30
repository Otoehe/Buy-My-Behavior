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
  } catch {
    return null;
  }
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
  } catch {/* ignore */}
}

export default function AuthCallback({ next = '/map' }: Props) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading'|'ok'|'error'>('loading');

  const targetNext = useMemo(
    () => parseNextFromUrl() || localStorage.getItem('post_auth_next') || next,
    [next]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // 1) Перевіряємо чи вже є сесія
        let { data: { session } } = await supabase.auth.getSession();

        // 2) Якщо немає — міняємо код на сесію (magic-link)
        if (!session) {
          await supabase.auth.exchangeCodeForSession(window.location.href);
          ({ data: { session } } = await supabase.auth.getSession());
        }

        if (!alive) return;

        if (session?.user) {
          await syncReferralOnce(session.user.id);
          setStatus('ok');
          // очищаємо URL та йдемо на потрібний екран
          const dest = targetNext || '/map';
          window.history.replaceState({}, document.title, dest);
          navigate(dest, { replace: true });
          return;
        }

        setStatus('error');
        navigate('/register', { replace: true });
      } catch (e) {
        console.error('[AuthCallback] exchange error', e);
        if (!alive) return;
        setStatus('error');
        navigate('/register', { replace: true });
      }
    })();

    return () => { alive = false; };
  }, [navigate, targetNext]);

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Входимо…</h1>
      <p>Будь ласка, зачекайте кілька секунд.</p>
      {status === 'error' && (
        <p style={{ color: 'crimson' }}>
          Не вдалося підтвердити вхід. Спробуйте натиснути посилання з листа ще раз.
        </p>
      )}
    </div>
  );
}
