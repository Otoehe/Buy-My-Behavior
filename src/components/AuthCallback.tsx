// src/components/AuthCallback.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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

export default function AuthCallback({ next = '/map' }: { next?: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  const targetNext = useMemo(
    () => parseNextFromUrl() || localStorage.getItem('post_auth_next') || next,
    [next]
  );

  useEffect(() => {
    (async () => {
      try {
        // 1) обмін коду на сесію (ідемпотентно: якщо вже міняли — помилки не буде)
        await supabase.auth.exchangeCodeForSession(window.location.href).catch(() => {});

        // 2) невелика затримка, щоб SDK устиг записати сесію у localStorage
        await new Promise((r) => setTimeout(r, 150));

        // 3) перевіряємо сесію
        let { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          // друга спроба через мить (на випадок повільної мережі)
          await new Promise((r) => setTimeout(r, 350));
          ({ data: { session } } = await supabase.auth.getSession());
        }

        if (session?.user) {
          await syncReferralOnce(session.user.id);
          setStatus('ok');

          // чистимо URL і переходимо
          const nextUrl = targetNext || '/map';
          window.history.replaceState({}, document.title, nextUrl);
          navigate(nextUrl, { replace: true });
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
