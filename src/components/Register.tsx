import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Register.css';
import InAppOpenInBrowserBanner from './InAppOpenInBrowserBanner';

export default function Register() {
  const navigate = useNavigate();

  // ——— якщо вже залогінений — одразу редіректимо; також слухаємо всі події авторизації
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (session?.user) {
        const next = localStorage.getItem('post_auth_next') || '/map';
        navigate(next, { replace: true });
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const next = localStorage.getItem('post_auth_next') || '/map';
        navigate(next, { replace: true });
      }
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [navigate]);

  // ====== STATE ======
  const [email, setEmail] = useState('');
  const [referral_code, setReferralCode] = useState('');

  const [loadingSignup, setLoadingSignup] = useState(false);
  const [loadingLogin, setLoadingLogin]   = useState(false);

  const inFlightRef = useRef(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const blocked = () => inFlightRef.current || Date.now() < cooldownUntil;
  const startFlight = (ms = 2400) => { inFlightRef.current = true; setCooldownUntil(Date.now() + ms); };
  const endFlight   = () => { inFlightRef.current = false; };

  const [showRefModal, setShowRefModal] = useState(false);
  const [showEmailSentModal, setShowEmailSentModal] = useState(false);

  const isEmailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email]
  );

  const appBase =
    (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const redirectAfterSignup = `${appBase}/auth/callback?next=${encodeURIComponent('/profile')}`;
  const redirectAfterLogin  = `${appBase}/auth/callback?next=${encodeURIComponent('/map')}`;

  // ====== HANDLERS ======
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid || blocked()) { if (!isEmailValid) return; alert('Зачекайте…'); return; }

    if (!referral_code.trim()) { setShowRefModal(true); return; }

    setLoadingSignup(true); startFlight();
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, wallet')
        .eq('referral_code', referral_code.trim())
        .maybeSingle();
      if (error) throw error;
      if (!data) { alert('Невірний реф-код'); return; }

      localStorage.setItem('referred_by', data.user_id);
      localStorage.setItem('referrer_wallet', data.wallet || '');
      localStorage.setItem('post_auth_next', '/profile');

      const { error: sErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectAfterSignup },
      });
      if (sErr) throw sErr;

      setShowEmailSentModal(true);
    } catch (err: any) {
      alert('Помилка реєстрації: ' + (err?.message || 'невідома'));
    } finally { setLoadingSignup(false); endFlight(); }
  };

  const handleLogin = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (!isEmailValid || blocked()) { if (!isEmailValid) return; alert('Зачекайте…'); return; }

    setLoadingLogin(true); startFlight();
    try {
      localStorage.setItem('post_auth_next', '/map');
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectAfterLogin, shouldCreateUser: false },
      });
      if (error) throw error;
      setShowEmailSentModal(true);
    } catch (err: any) {
      alert('Помилка входу: ' + (err?.message || 'невідома'));
    } finally { setLoadingLogin(false); endFlight(); }
  };

  // ====== UI ======
  return (
    <div className="register-page">
      <InAppOpenInBrowserBanner />

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

        <button
          className="bmb-btn-black"
          type="submit"
          disabled={!isEmailValid || loadingSignup || loadingLogin || blocked()}
        >
          {loadingSignup ? 'Відправляю…' : 'Зареєструватися'}
        </button>

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

      {/* Модалка про реф-код */}
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
          <p>Введіть реферальне слово амбасадора, щоб продовжити.</p>
          <button type="button" className="bmb-btn-black" onClick={() => setShowRefModal(false)}>Добре</button>
        </div>
      </div>

      {/* Модалка “перейдіть на пошту” */}
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
          <p>Відкрийте лист і натисніть кнопку входу. Якщо листа немає — перевірте “Спам”.</p>
          <button type="button" className="bmb-btn-black" onClick={() => setShowEmailSentModal(false)}>Добре</button>
        </div>
      </div>
    </div>
  );
}
