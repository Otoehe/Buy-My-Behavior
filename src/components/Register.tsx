import React, { useCallback, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { useNavigate } from 'react-router-dom';

// ─── UI state ──────────────────────────
const APP_URL =
  (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'https://buymybehavior.com');

type Phase = 'idle' | 'sending' | 'sent' | 'error';

function openBmb(payload: {
  kind?: 'success' | 'warning' | 'error' | 'confirm' | 'tx' | 'info' | 'magic' | 'congratsCustomer' | 'congratsPerformer',
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
  const [email, setEmail] = useState('');
  const [refWord, setRefWord] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const redirectTo = useMemo(() => `${APP_URL}/auth/callback?next=/map`, []);
  const navigate = useNavigate();

  // ─────────────── Supabase helpers ───────────────
  // FIX: id -> user_id, wallet_address -> wallet
  const verifyReferral = async (word: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, wallet, referral_code')
      .eq('referral_code', word.trim())
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as { user_id: string; wallet: string | null; referral_code: string | null } | null;
  };

  const sendMagicLink = async (emailValue: string) => {
    return supabase.auth.signInWithOtp({
      email: emailValue.trim(),
      options: { emailRedirectTo: redirectTo },
    });
  };

  const onRegister = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      openBmb({ kind: 'info', title: 'Повідомлення', subtitle: 'Вкажіть email.', actionLabel: 'Добре' });
      return;
    }
    if (!refWord.trim()) {
      openBmb({
        kind: 'warning',
        title: 'Реєстрація лише за реферальним словом',
        subtitle: 'Введіть реферальне слово амбасадора...',
        actionLabel: 'Добре',
      });
      return;
    }

    try {
      setPhase('sending');
      const ref = await verifyReferral(refWord);
      if (!ref) {
        setPhase('error');
        openBmb({ kind: 'error', title: 'Невірне реферальне слово', subtitle: 'Перевірте правильність.', actionLabel: 'Ок' });
        return;
      }

      // FIX: зберігаємо user_id реферера, а не неіснуючий id
      try {
        localStorage.setItem('bmb_ref_context', JSON.stringify({
          referred_by: ref.user_id,
          referrer_wallet: ref.wallet,
          referral_code: ref.referral_code,
        }));
      } catch {}

      const { error } = await sendMagicLink(email);
      if (error) throw error;

      setPhase('sent');
      openBmb({
        kind: 'magic',
        title: 'Магік-лінк надіслано',
        subtitle: <>Перевір пошту <b>{email}</b>. Відкрий посилання у зовнішньому браузері.</>,
        actionLabel: 'Добре',
      });
    } catch (err: any) {
      setPhase('error');
      openBmb({ kind: 'error', title: 'Сталася помилка', subtitle: String(err?.message), actionLabel: 'Добре' });
    }
  }, [email, refWord, redirectTo]);

  const onLogin = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      openBmb({ kind: 'info', title: 'Повідомлення', subtitle: 'Вкажіть email.', actionLabel: 'Добре' });
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
        subtitle: <>Перевір пошту <b>{email}</b> і відкрий у браузері.</>,
        actionLabel: 'Добре',
      });
    } catch (err: any) {
      setPhase('error');
      openBmb({ kind: 'error', title: 'Помилка', subtitle: String(err?.message), actionLabel: 'Добре' });
    }
  }, [email, redirectTo]);

  // ───────────── Вхід через MetaMask ─────────────
  const onWalletLogin = useCallback(async () => {
    try {
      setPhase('sending');

      if (!window.ethereum) {
        alert('Встановіть MetaMask');
        return;
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      const message = `BMB Login\nWallet: ${address}\nTime: ${Date.now()}`;
      const signature = await signer.signMessage(message);
      const recovered = ethers.utils.verifyMessage(message, signature);

      if (recovered.toLowerCase() !== address.toLowerCase()) {
        openBmb({ kind: 'error', title: 'Підпис не збігається', subtitle: 'Спробуйте ще раз', actionLabel: 'OK' });
        return;
      }

      // FIX: select id->user_id; eq wallet_address->wallet
      const { data: existing } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('wallet', address)
        .maybeSingle();

      if (!existing) {
        const context = localStorage.getItem('bmb_ref_context');
        const payload: Record<string, any> = {
          wallet: address, // FIX: wallet, а не wallet_address
          created_at: new Date().toISOString(),
        };

        if (context) {
          try {
            const parsed = JSON.parse(context);
            Object.assign(payload, {
              referred_by: parsed.referred_by ?? null,
              referrer_wallet: parsed.referrer_wallet ?? null,
              referral_code: parsed.referral_code ?? null,
            });
          } catch {}
        }

        const { error: insertError } = await supabase.from('profiles').insert(payload);
        if (insertError) {
          openBmb({ kind: 'error', title: 'Помилка створення профілю', subtitle: insertError.message, actionLabel: 'OK' });
          return;
        }
      }

      localStorage.setItem('wallet_address', address);
      navigate('/map');
    } catch (err: any) {
      openBmb({ kind: 'error', title: 'Помилка MetaMask', subtitle: String(err?.message), actionLabel: 'OK' });
    } finally {
      setPhase('idle');
    }
  }, [navigate]);

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
          <button type="submit" disabled={phase === 'sending'} style={{ ...btnBlack, opacity: phase === 'sending' ? 0.7 : 1 }}>
            Зареєструватися
          </button>
          <button type="button" onClick={onLogin} disabled={phase === 'sending'} style={{ ...btnBlack, opacity: phase === 'sending' ? 0.7 : 1 }}>
            Увійти
          </button>
          <button type="button" onClick={onWalletLogin} disabled={phase === 'sending'} style={{ ...btnMetaMask, opacity: phase === 'sending' ? 0.7 : 1 }}>
            Увійти через MetaMask
          </button>
        </form>
      </div>
    </div>
  );
}

// ────────────── стилі ──────────────
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

const btnMetaMask: React.CSSProperties = {
  ...btnBlack,
  background: '#ffcdd6',
  color: '#000',
  border: '1px solid #000',
};
