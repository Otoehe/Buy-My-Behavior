// src/components/Register.tsx
import React, { useCallback, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const APP_URL =
  (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'https://buymybehavior.com');

type Phase = 'idle' | 'sending' | 'sent' | 'error';

// ─── BMB modal helpers (працюють з BmbModalHost) ───
function openBmb(payload: {
  kind?: 'success'|'warning'|'error'|'confirm'|'tx'|'info'|'magic'|'congratsCustomer'|'congratsPerformer',
  title?: React.ReactNode,
  subtitle?: React.ReactNode,
  actionLabel?: string,
  noBackdropClose?: boolean,
  hideClose?: boolean,
}) {
  window.dispatchEvent(new CustomEvent('bmb:modal:open', { detail: payload }));
}
function closeBmb() {
  window.dispatchEvent(new Event('bmb:modal:close'));
}

export default function Register() {
  // ───────────────── state ─────────────────
  const [email, setEmail] = useState('');
  const [refWord, setRefWord] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');

  // куди повертаємося після магік-лінку
  const redirectTo = useMemo(() => `${APP_URL}/auth/callback?next=/map`, []);

  // ─────────────── Supabase helpers ───────────────
  // Перевірка реф-слова у profiles.referral_code
  const verifyReferral = async (word: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, wallet, referral_code')
      .eq('referral_code', word.trim())
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data; // null, якщо код не знайдено
  };

  const sendMagicLink = async (emailValue: string) => {
    return supabase.auth.signInWithOtp({
      email: emailValue.trim(),
      options: { emailRedirectTo: redirectTo },
    });
  };

  // ─────────────── submit handlers ───────────────
  const onRegister = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      openBmb({
        kind: 'info',
        title: 'Повідомлення',
        subtitle: 'Вкажіть email.',
        actionLabel: 'Добре',
      });
      return;
    }

    if (!refWord.trim()) {
      openBmb({
        kind: 'warning',
        title: 'Реєстрація лише за реферальним словом',
        subtitle:
          'Введіть реферальне слово амбасадора, щоб продовжити. Якщо коду немає — зверніться до амбасадора BMB.',
        actionLabel: 'Добре',
      });
      return;
    }

    try {
      setPhase('sending');

      const ref = await verifyReferral(refWord);
      if (!ref) {
        setPhase('error');
        openBmb({
          kind: 'error',
          title: 'Невірне реферальне слово',
          subtitle: 'Перевірте правильність або зверніться до амбасадора BMB.',
          actionLabel: 'Зрозуміло',
        });
        return;
      }

      // збережемо контекст запрошення — дочитаємо та запишемо у профіль після логіну
      try {
        localStorage.setItem(
          'bmb_ref_context',
          JSON.stringify({ referred_by: ref.id, referrer_wallet: ref.wallet, referral_code: ref.referral_code })
        );
      } catch {}

      const { error } = await sendMagicLink(email);
      if (error) throw error;

      setPhase('sent');
      openBmb({
        kind: 'magic',
        title: 'Магік-лінк надіслано',
        subtitle: (
          <>
            Перевір пошту <b>{email}</b>. Відкрий посилання у зовнішньому браузері (Chrome/Safari).
            Після переходу має перекинути на <b>«Обрати виконавця»</b>.
          </>
        ),
        actionLabel: 'Добре',
      });
    } catch (err: any) {
      setPhase('error');
      openBmb({
        kind: 'error',
        title: 'Сталася помилка',
        subtitle: String(err?.message || 'Спробуйте ще раз трохи пізніше.'),
        actionLabel: 'Добре',
      });
    }
  }, [email, refWord, redirectTo]);

  // логін без реф-слова
  const onLogin = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      openBmb({
        kind: 'info',
        title: 'Повідомлення',
        subtitle: 'Вкажіть email.',
        actionLabel: 'Добре',
      });
      return;
    }

    try {
      setPhase('sending');
      const { error } = await sendMagicLink(email);
      if (error) throw error;

      setPhase('sent');
      openBmb({
        kind: 'magic',
        title: 'Магік-лінк надіслано',
        subtitle: (
          <>
            Перевір пошту <b>{email}</b>. Відкрий посилання у зовнішньому браузері (Chrome/Safari).
            Після переходу має перекинути на <b>«Обрати виконавця»</b>.
          </>
        ),
        actionLabel: 'Добре',
      });
    } catch (err: any) {
      setPhase('error');
      openBmb({
        kind: 'error',
        title: 'Сталася помилка',
        subtitle: String(err?.message || 'Спробуйте ще раз трохи пізніше.'),
        actionLabel: 'Добре',
      });
    }
  }, [email, redirectTo]);

  // ───────────────── UI ─────────────────
  return (
    <div style={pageWrap}>
      <div style={card}>
        <h1 style={title}>Реєстрація з реферальним словом</h1>

        <form onSubmit={onRegister} style={formGrid}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ ...input, background: '#eaf2ff' }}
            autoComplete="email"
          />

          <input
            type="text"
            value={refWord}
            onChange={(e) => setRefWord(e.target.value)}
            placeholder="Реферальний код"
            style={input}
            autoComplete="one-time-code"
          />

          <button
            type="submit"
            disabled={phase === 'sending'}
            style={{ ...btnBlack, opacity: phase === 'sending' ? 0.7 : 1 }}
          >
            Зареєструватися
          </button>

          <button
            type="button"
            onClick={onLogin}
            disabled={phase === 'sending'}
            style={{ ...btnBlack, opacity: phase === 'sending' ? 0.7 : 1 }}
          >
            Увійти
          </button>
        </form>
      </div>
    </div>
  );
}

// ────────────── стилі (під твій макет) ──────────────
const pageWrap: React.CSSProperties = {
  minHeight: 'calc(100vh - 120px)',
  display: 'grid',
  placeItems: 'center',
  padding: '32px 16px',
};

const card: React.CSSProperties = {
  width: 'min(680px, 92vw)',
  background: '#f7f7f7',
  borderRadius: 16,
  padding: 24,
  boxShadow: '0 30px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
  border: '1px solid #eaeaea',
};

const title: React.CSSProperties = {
  margin: '8px 0 20px',
  fontSize: 24,
  fontWeight: 800,
  textAlign: 'center',
  color: '#111',
};

const formGrid: React.CSSProperties = {
  display: 'grid',
  gap: 14,
};

const input: React.CSSProperties = {
  height: 48,
  borderRadius: 12,
  border: '1px solid #e3e3e3',
  padding: '0 14px',
  fontSize: 16,
  outline: 'none',
  background: '#fff',
  color: '#111',
};

const btnBlack: React.CSSProperties = {
  height: 52,
  borderRadius: 12,
  border: '1px solid #000',
  background: '#000',
  color: '#fff',
  fontWeight: 700,
  fontSize: 16,
  cursor: 'pointer',
};
