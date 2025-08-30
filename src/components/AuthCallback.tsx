// src/components/AuthCallback.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

function parseNextFromUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    const qNext = url.searchParams.get('next');
    if (qNext) return qNext;
    const hashNext = new URLSearchParams(url.hash.replace(/^#/, '')).get('next');
    return hashNext;
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

export default function AuthCallback({ next = '/map' }: { next?: string }) {
  const [status, setStatus] = useState<'loading'|'ok'|'error'>('loading');
  const targetNext = useMemo(
    () => parseNextFromUrl() || localStorage.getItem('post_auth_next') || next,
    [next]
  );

  useEffect(() => {
    let alive = true;

    const hardRedirect = (to: string) => {
      // прибираємо службові параметри з адресного рядка перед редіректом
      try { window.history.replaceState({}, document.title, to); } catch {}
      // ВАЖЛИВО: «жорсткий» редірект, щоб додаток стартував з уже збереженою сесією
      window.location.replace(to);
    };

    const finishIfSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await syncReferralOnce(session.user.id);
        if (!alive) return true;
        setStatus('ok');
        hardRedirect(targetNext || '/map');
        return true;
      }
      return false;
    };

    (async () => {
      try {
        const url = new URL(window.location.href);

        // Якщо це PKCE/код (OAuth-провайдери) — міняємо на сесію
        if (url.searchParams.has('code')) {
          try {
            const { error } = await supabase.auth.exchangeCodeForSession(url.href);
            if (error) console.warn('[AuthCallback] exchange error:', error.message);
          } catch (e) {
            console.warn('[AuthCallback] exchange throw:', e);
          }
        }

        // 1) Пробуємо завершити одразу
        if (await finishIfSession()) return;

        // 2) Чекаємо подію (для email magic-link detectSessionInUrl підхопить хеш)
        const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
          if (!alive) return;
          if (session?.user) {
            finishIfSession();
          }
        });

        // 3) Підстраховка: повторна перевірка через 1200мс
        setTimeout(async () => {
          if (!alive) return;
          if (!(await finishIfSession())) {
            setStatus('error');
            // не робимо миттєвий редірект на /register — покажемо повідомлення,
            // щоб користувач міг спробувати ще раз (кнопка «Назад»/повторити лінк)
          }
        }, 1200);

        return () => sub.subscription.unsubscribe();
      } catch (e) {
        console.error('[AuthCallback] fatal:', e);
        setStatus('error');
      }
    })();

    return () => { alive = false; };
  }, [targetNext]);

  return (
    <div style={{ padding: 16 }}>
      <h3>Входимо…</h3>
      <p>Будь ласка, зачекайте кілька секунд.</p>
      {status === 'error' && (
        <p style={{ color: 'crimson', marginTop: 12 }}>
          Не вдалось підтвердити вхід. Спробуйте натиснути посилання з листа ще раз.
        </p>
      )}
    </div>
  );
}
