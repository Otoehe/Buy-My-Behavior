// src/components/Register.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const APP_URL =
  (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'https://buymybehavior.com');

type Phase = 'idle' | 'sending' | 'sent' | 'error';

export default function Register() {
  // ───────────────── state ─────────────────
  const [email, setEmail] = useState('');
  const [refWord, setRefWord] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMagicModalOpen, setMagicModalOpen] = useState(false);

  // куди повертаємося після магік-лінку
  const redirectTo = useMemo(
    () => `${APP_URL}/auth/callback?next=/map`,
    []
  );

  const openMagicModal = useCallback(() => {
    setMagicModalOpen(true);
    try { document.body.style.overflow = 'hidden'; } catch {}
  }, []);
  const closeMagicModal = useCallback(() => {
    setMagicModalOpen(false);
    setPhase('idle');
    setErrorMsg(null);
    try { document.body.style.overflow = ''; } catch {}
  }, []);

  // закриття модалки по ESC
  useEffect(() => {
    if (!isMagicModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMagicModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMagicModalOpen, closeMagicModal]);

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
  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim()) { setErrorMsg('Вкажіть email.'); openMagicModal(); return; }
    if (!refWord.trim()) { setErrorMsg('Потрібне реферальне слово для реєстрації.'); openMagicModal(); return; }

    try {
      setPhase('sending');

      const ref = await verifyReferral(refWord);
      if (!ref) { setPhase('error'); setErrorMsg('Невірне реферальне слово.'); openMagicModal(); return; }

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
      openMagicModal();
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err?.message || 'Сталася помилка.');
      openMagicModal();
    }
  };

  // логін без реф-слова
  const onLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim()) { setErrorMsg('Вкажіть email.'); openMagicModal(); return; }

    try {
      setPhase('sending');
      const { error } = await sendMagicLink(email);
      if (error) throw error;
      setPhase('sent');
      openMagicModal();
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err?.message || 'Сталася помилка.');
      openMagicModal();
    }
  };

  // ───────────────── UI (дизайн як на скріні) ─────────────────
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
            // легкий блакитний фон як на скріні
            style={{ ...input, background: '#eaf2ff' }}
          />

          <input
            type="text"
            value={refWord}
            onChange={(e) => setRefWord(e.target.value)}
            placeholder="Реферальний код"
            style={input}
          />

          <button type="submit" disabled={phase === 'sending'} style={{ ...btnBlack, opacity: phase === 'sending' ? 0.7 : 1 }}>
            Зареєструватися
          </button>

          <button type="button" onClick={onLogin} disabled={phase === 'sending'} style={{ ...btnBlack, opacity: phase === 'sending' ? 0.7 : 1 }}>
            Увійти
          </button>
        </form>
      </div>

      {/* Модалка підтвердження/помилки */}
      {isMagicModalOpen && (
        <Modal onClose={closeMagicModal}>
          {phase === 'sent' && (
            <>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Магік-лінк надіслано</h3>
              <p style={{ marginTop: 8 }}>
                Перевір пошту <b>{email}</b>.<br />
                Відкрий посилання у зовнішньому браузері (Chrome/Safari).<br />
                Після переходу має перекинути на <b>«Обрати виконавця»</b>.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={closeMagicModal} style={btnBlackSmall}>Закрити</button>
              </div>
            </>
          )}

          {(phase === 'error' || (phase === 'idle' && errorMsg)) && (
            <>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Повідомлення</h3>
              <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{errorMsg || 'Сталася помилка.'}</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={closeMagicModal} style={btnBlackSmall}>Ок</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ────────────── автономна модалка з закриттям по фону/ESC ──────────────
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const onOverlayClick = (e: React.MouseEvent) => { e.stopPropagation(); onClose(); };
  const onCardClick = (e: React.MouseEvent) => { e.stopPropagation(); };

  return (
    <div style={overlay} onClick={onOverlayClick}>
      <div style={modalCard} onClick={onCardClick} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

// ────────────── стилі (під скрін) ──────────────
const pageWrap: React.CSSProperties = {
  minHeight: 'calc(100vh - 120px)', // щоб під навбаром красиво центрувалось
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

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
};

const modalCard: React.CSSProperties = {
  width: 'min(560px, 92vw)',
  background: '#fff',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 18px 40px rgba(0,0,0,0.25)',
  color: '#111',
};

const btnBlackSmall: React.CSSProperties = {
  ...btnBlack,
  height: 40,
  fontSize: 15,
};
