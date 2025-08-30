import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './Register.css';
import './Register.mobile.css';

const APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || 'https://www.buymybehavior.com').replace(/\/+$/, '');
const AUTH_CALLBACK = `${APP_URL}/auth/callback`;

export default function Register() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Якщо користувач уже залогінений — тихо прокидаємо реферал у БД (разово)
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const referred_by = localStorage.getItem('referred_by');
        const referrer_wallet = localStorage.getItem('referrer_wallet');
        if (!referred_by && !referrer_wallet) return;

        const { data: prof } = await supabase
          .from('profiles')
          .select('user_id,referred_by,referrer_wallet')
          .eq('user_id', user.id)
          .maybeSingle();

        if (prof && (prof.referred_by || prof.referrer_wallet)) return;

        const payload: any = { user_id: user.id };
        if (referred_by) payload.referred_by = referred_by;
        if (referrer_wallet) payload.referrer_wallet = referrer_wallet;

        await supabase.from('profiles').upsert(payload);
        // очистимо локальний кеш, щоб не писати повторно
        localStorage.removeItem('referred_by');
        localStorage.removeItem('referrer_wallet');
      } catch (e) {
        console.warn('Referral attach skipped:', e);
      }
    })();
  }, []);

  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    // Порада користувачу: відкрити посилання саме у зовнішньому браузері
    const isInApp = /(FBAN|FBAV|Instagram|Line|WeChat|Twitter|WhatsApp|Telegram)/i.test(
      navigator.userAgent || ''
    );
    if (isInApp) {
      setMessage('Будь ласка, коли отримаєш лист, відкрий посилання в ЗОВНІШНЬОМУ браузері (Chrome/Safari), не у вбудованому переглядачі.');
    }

    setSending(true);
    try {
      // ЖОРСТКО фіксуємо https://www.buymybehavior.com як редірект, але з фолбеком на ENV
      const redirectTo = AUTH_CALLBACK;

      console.log('[Register] redirectTo =', redirectTo, ' current host =', window.location.host);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true
        }
      });

      if (error) throw error;

      setMessage('Магік-лінк відправлено! Перевір пошту і відкрий посилання у зовнішньому браузері.');
    } catch (err: any) {
      console.error('Magic link error:', err);
      setMessage(err?.message || 'Не вдалося відправити лист. Спробуй ще раз.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="register-page">
      <form className="register-form" onSubmit={handleSendMagicLink}>
        <h1>Вхід / Реєстрація</h1>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <button type="submit" disabled={sending}>
          {sending ? 'Надсилаємо…' : 'Отримати магік-лінк'}
        </button>

        {message && <p className="hint">{message}</p>}

        <p className="tiny">
          Після переходу за посиланням ти потрапиш на сторінку <b>“Обрати виконавця”</b>.
        </p>
      </form>
    </div>
  );
}
