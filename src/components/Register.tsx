import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Register.css';

export default function Register() {
  const navigate = useNavigate();

  // ✅ Ініціалізація сесії + підписка — щоб уникнути «блимання» форми
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;

        if (session?.user) {
          // разова синхронізація рефералки
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
                const payload: any = { user_id: session.user.id };
                if (referred_by) payload.referred_by = referred_by;
                if (referrer_wallet) payload.referrer_wallet = referrer_wallet;
                await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
              }
            }
          } catch {}

          navigate('/profile', { replace: true });
          return;
        }
      } catch {
        // ignore
      }

      // підписка: як тільки сесія з'явиться — миттєво злітаємо з /register
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        if (session?.user) {
          navigate('/profile', { replace: true });
        }
      });
      unsub = () => sub.subscription.unsubscribe();
    })();

    return () => { try { unsub?.(); } catch {} };
  }, [navigate]);

  const [email, setEmail] = useState('');
  const [referral_code, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);

  const isEmailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email]
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid) return;

    setLoading(true);
    try {
      if (!referral_code.trim()) {
        alert('Введіть реферальне слово амбасадора.');
        return;
      }

      // Перевіряємо реф-код
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

      // Збережемо контекст до колбеку
      localStorage.setItem('referred_by', data.user_id);
      localStorage.setItem('referrer_wallet', data.wallet || '');

      // Після підтвердження хочемо опинитись у профілі
      localStorage.setItem('post_auth_next', '/profile');

      const siteUrl = (import.meta.env.VITE_SITE_URL as string) || window.location.origin;
      const { error: sErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/profile')}`,
        },
      });
      if (sErr) throw sErr;

      alert('Лист надіслано. Відкрийте пошту та підтвердьте вхід.');
    } catch (err: any) {
      alert('Помилка реєстрації: ' + (err?.message || 'невідома'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <form className="register-container" onSubmit={submit}>
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
          required
          value={referral_code}
          onChange={(e) => setReferralCode(e.target.value)}
        />

        <button className="bmb-btn-black" disabled={!isEmailValid || loading}>
          {loading ? 'Відправляю…' : 'Зареєструватися'}
        </button>
      </form>
    </div>
  );
}
