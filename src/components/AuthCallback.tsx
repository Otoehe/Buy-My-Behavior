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
  } catch {}
}

export default function AuthCallback({ next = '/map' }: Props) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  const targetNext = useMemo(
    () => parseNextFromUrl() || localStorage.getItem('post_auth_next') || next,
    [next]
  );

  useEffect(() => {
    let unsub: { unsubscribe(): void } | undefined;
    let finished = false;

    (async () => {
      try {
        // 0) Якщо вже є сесія — завершуємо одразу
        let { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await syncReferralOnce(session.user.id);
          const dest = targetNext || '/map';
          window.history.replaceState({}, document.title, dest);
          finished = true;
          navigate(dest, { replace: true });
          return;
        }

        // 1) Чекаємо подію SIGNED_IN (макс 8с), підписуємося ЗАЗДАЛЕГІДЬ
        const waitSignedIn = new Promise<void>((resolve) => {
          const to = setTimeout(() => resolve(), 8000);
          const { data } = supabase.auth.onAuthStateChange((event, s) => {
            if (event === 'SIGNED_IN' && s?.user) {
              clearTimeout(to);
              data.subscription.unsubscribe();
              resolve();
            }
          });
          unsub = data.subscription;
        });

        // 2) Якщо це OAuth/PKCE — обміняти ?code= на сесію
        const url = new URL(window.location.href);
        if (url.searchParams.get('code')) {
          // Для v2 працює з повним href
          const { error } = await supabase.auth.exchangeCodeForSession(url.href);
          if (error) throw error;
        }
        // Якщо email magic-link (токени у #hash) — detectSessionInUrl=true зробить все сама;
        // ми просто чекаємо на SIGNED_IN.

        await waitSignedIn;

        // 3) Перевіряємо й завершуємо
        ({ data: { session } } = await supabase.auth.getSession());
        if (!session?.user) throw new Error('no-session');

        await syncReferralOnce(session.user.id);

        const dest = targetNext || '/map';
        window.history.replaceState({}, document.title, dest);
        finished = true;
        navigate(dest, { replace: true });
      } catch (e) {
        if (!finished) {
          console.error('[AuthCallback] error', e);
          setStatus('error');
          navigate('/register', { replace: true });
        }
      }
    })();

    return () => { unsub?.unsubscribe(); };
  }, [navigate, targetNext]);

  return (
    <div style={{ padding: 16 }}>
      <h3>Входимо…</h3>
      <p>Будь ласка, зачекайте кілька секунд.</p>
      {status === 'error' && (
        <p style={{ color: 'crimson' }}>
          Не вдалося підтвердити вхід. Спробуйте натиснути посилання з листа ще раз.
        </p>
      )}
    </div>
  );
}
