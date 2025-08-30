// src/components/AuthCallback.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Props = { next?: string };

// читаємо next із query або hash
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
        const url = new URL(window.location.href);

        // 1) Підписуємося наперед і чекаємо саме SIGNED_IN
        const waitSignedIn = new Promise<void>((resolve, reject) => {
          const to = setTimeout(() => reject(new Error('timeout')), 8000);
          const { data } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
              clearTimeout(to);
              data.subscription.unsubscribe();
              resolve();
            }
          });
          unsub = data.subscription;
        });

        // 2) Якщо це OAuth/PKCE — у посиланні буде ?code=
        const code = url.searchParams.get('code');
        if (code) {
          // новий API приймає сам code (не весь href)
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // Якщо magic-link (email) — detectSessionInUrl=true зробить усе сам,
        // просто чекаємо події SIGNED_IN.

        // 3) Чекаємо фактичного входу
        await waitSignedIn.catch(() => {}); // на випадок, якщо вже залогінені

        // 4) Перевіряємо сесію і лише тоді редіректимо
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('no-session');

        await syncReferralOnce(session.user.id);

        // чистимо URL від сміття (код/токени)
        window.history.replaceState({}, document.title, targetNext || '/map');

        finished = true;
        navigate(targetNext || '/map', { replace: true });
      } catch (e) {
        if (!finished) {
          console.error('[AuthCallback] verify error:', e);
          setStatus('error');
          navigate('/register', { replace: true });
        }
      }
    })();

    return () => {
      unsub?.unsubscribe();
    };
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
