// src/components/Register.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Register.css';

export default function Register() {
  const navigate = useNavigate();

  // ====== SESSION BOOT ======
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;

        if (session?.user) {
          // разова синхронізація рефералки (якщо ще не записана)
          try {
            const referred_by = localStorage.getItem('referred_by');
            const referrer_wallet = localStorage.getItem('referrer_wallet');
            if (referred_by || referrer_wallet) {
              const { data: prof } = await supabase
                .from('profiles')
                .select('user_id,referred_by,referrer_wallet')
                .eq('user_id', session.user.id)
                .maybeSingle();

              if (!prof || (!prof.referred_by && !prof.referrer_wallet)) {
                const payload: Record<string, any> = { user_id: session.user.id };
                if (referred_by) payload.referred_by = referred_by;
                if (referrer_wallet) payload.referrer_wallet = referrer_wallet;
                await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
              }
            }
          } catch { /* ignore */ }

          navigate('/profile', { replace: true });
          return;
        }
      } catch { /* ignore */ }

      // якщо сесія з'явиться — одразу злітаємо з /register
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        if (session?.user) navigate('/profile', { replace: true });
      });
      unsub = () => sub.subscription.unsubscribe();
    })();

    return () => { try { unsub?.(); } catch {} };
  }, [navigate]);

  // ====== STATE ======
  const [email, setEmail] = useState('');
  const [referral_code, setReferralCode] = useState('');

  // окремі лоадінги для кнопок
  const [loadingSignup, setLoadingSignup] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);

  // глобальний in-flight + короткий кулдаун, щоб не ловити 429
  const inFlightRef = useRef(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const blocked = () => inFlightRef.current || Date.now() < cooldownUntil;
  const startFlight = (ms = 2400) => { inFlightRef.current = true; setCooldownUntil(Date.now() + ms); };
  const endFlight   = () => { inFlightRef.current = false; };

  // модалки
  const [showRefModal, setShowRefModal] = useState(false);
  const [showEmailSentModal, setShowEmailSentModal] = useState(false); // ← нова модалка

  const isEmailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email]
  );

  // куди редіректити після маглінка
  const appBase =
    (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const redirectAfterSignup = `${appBase}/auth/callback?next=${encodeURIComponent('/profile')}`; // новачок → профіль
  const redirectAfterLogin  = `${appBase}/auth/callback?next=${encodeURIComponent('/map')}`;     // існуючий → вибрати виконавця

  // ====== HANDLERS ======
  // Реєстрація з реф-кодом
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid || blocked()) {
      if (!isEmailValid) return;
      alert('Зачекайте пару секунд…');
      return;
    }

    // якщо реф-код не заповнено — показуємо модалку і не шлемо запит
    if (!referral_code.trim()) {
      setShowRefModal(true);
      return;
    }

    setLoadingSignup(true);
    startFlight();

    try {
      // перевіряємо валідність реф-коду
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, wallet')
        .eq('referral_code', referral_code.trim())
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        alert('Невірний реф-код. Зверніться до амбасадора.');
        return;
      }

      // збережемо контекст до колбеку
      localStorage.setItem('referred_by', data.user_id);
      localStorage.setItem('referrer_wallet', data.wallet || '');
      localStorage.setItem('post_auth_next', '/profile');

      const { error: sErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectAfterSignup },
      });
      if (sErr) throw sErr;

      // ✅ замість alert — корпоративна модалка
      setShowEmailSentModal(true);
    } catch (err: any) {
      alert('Помилка реєстрації: ' + (err?.message || 'невідома'));
    } finally {
      setLoadingSignup(false);
      endFlight();
    }
  };

  // Вхід без реф-коду (існуючий користувач)
  const handleLogin = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isEmailValid || blocked()) {
      if (!isEmailValid) return;
      alert('Зачекайте пару секунд…');
      return;
    }

    setLoadingLogin(true);
    startFlight();

    try {
      localStorage.setItem('post_auth_next', '/map');

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectAfterLogin,
          shouldCreateUser: false, // тільки вхід
        },
      });
      if (error) throw error;

      // ✅ та ж корпоративна модалка
      setShowEmailSentModal(true);
    } catch (err: any) {
      alert('Помилка входу: ' + (err?.message || 'невідома'));
    } finally {
      setLoadingLogin(false);
      endFlight();
    }
  };

  // ====== UI ======
  return (
    <div className="register-page">
      <form className="register-container" onSubmit={handleSignup}>
        <h2>Реєстрація з реферальним словом</h2>

        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
        />

        <input
          type="text"
          placeholder="Реферальний код"
          value={referral_code}
          onChange={(e) => setReferralCode(e.target.value)}
        />

        {/* Кнопка реєстрації */}
        <button
          className="bmb-btn-black"
          type="submit"
          disabled={!isEmailValid || loadingSignup || loadingLogin || blocked()}
        >
          {loadingSignup ? 'Відправляю…' : 'Зареєструватися'}
        </button>

        {/* Кнопка входу (той самий дизайн, type="button") */}
        <button
          className="bmb-btn-black"
          type="button"
          onClick={handleLogin}
          disabled={!isEmailValid || loadingSignup || loadingLogin || blocked()}
          style={{ marginTop: 8 }}
        >
          {loadingLogin ? 'Відправляю…' : 'Увійти'}
        </button>
      </form>

      {/* === BMB MODAL: реєстрація лише за реф-кодом === */}
      <div
        className="bmb-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bmb-ref-modal-title"
        style={{ display: showRefModal ? 'flex' : 'none' }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowRefModal(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setShowRefModal(false); }}
      >
        <div className="bmb-modal-card bmb-pink-bubbles">
          <div className="bmb-modal-icon">🔑</div>
          <h3 id="bmb-ref-modal-title">Реєстрація лише за реферальним словом</h3>
          <p>
            Введіть реферальне слово амбасадора, щоб продовжити.
            Якщо коду немає — зверніться до амбасадора BMB.
          </p>
          <button type="button" className="bmb-btn-black" onClick={() => setShowRefModal(false)}>
            Добре
          </button>
        </div>
      </div>

      {/* === BMB MODAL: “Перейдіть на пошту — ми надіслали посилання” (для signup & login) === */}
      <div
        className="bmb-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bmb-mail-modal-title"
        style={{ display: showEmailSentModal ? 'flex' : 'none' }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowEmailSentModal(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setShowEmailSentModal(false); }}
      >
        <div className="bmb-modal-card bmb-pink-bubbles">
          <div className="bmb-modal-icon">📧</div>
          <h3 id="bmb-mail-modal-title">Перейдіть на пошту — ми надіслали посилання</h3>
          <p>
            Відкрийте лист і натисніть кнопку входу. Якщо листа немає — перевірте “Спам”.
            <br />
            <strong>Порада:</strong> якщо сторінка відкрилася в застосунку пошти,
            виберіть «Відкрити в Chrome/Safari», щоб продовжити у чистому браузері.
          </p>
          <button type="button" className="bmb-btn-black" onClick={() => setShowEmailSentModal(false)}>
            Добре
          </button>
        </div>
      </div>
    </div>
  );
}
