import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import './Register.css';
import './Register.mobile.css';

const APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || 'https://www.buymybehavior.com').replace(/\/+$/, '');
const AUTH_CALLBACK = `${APP_URL}/auth/callback`;

/** Проста модалка всередині одного файлу (щоб не чіпати інші компоненти) */
function Modal({
  open, title, onClose, children,
}: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'grid', placeItems: 'center', zIndex: 9999
    }}>
      <div style={{
        width: 'min(520px, 92vw)', background: '#fff', borderRadius: 16,
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)', padding: 20
      }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{children}</div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 10, border: 0, background: '#eee' }}>
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Register() {
  const [email, setEmail] = useState('');
  const [refCode, setRefCode] = useState('');
  const [sending, setSending] = useState<null | 'reg' | 'login'>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Модалка-попередження
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('Повідомлення');
  const [modalBody, setModalBody] = useState<React.ReactNode>(null);

  const isInApp = useMemo(
    () => /(FBAN|FBAV|Instagram|Line|WeChat|Twitter|WhatsApp|Telegram)/i.test(navigator.userAgent || ''),
    []
  );

  // Після входу — разово підчепити реферал у БД
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
        localStorage.removeItem('referred_by');
        localStorage.removeItem('referrer_wallet');
      } catch {/* no-op */}
    })();
  }, []);

  function showModal(title: string, body: React.ReactNode) {
    setModalTitle(title);
    setModalBody(body);
    setModalOpen(true);
  }

  async function sendOtp(shouldCreateUser: boolean) {
    setHint(null);
    setSending(shouldCreateUser ? 'reg' : 'login');

    try {
      if (refCode?.trim()) localStorage.setItem('referred_by', refCode.trim());

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: AUTH_CALLBACK,
          shouldCreateUser,
        },
      });
      if (error) throw error;

      // Модалка з інструкціями
      const extra = isInApp
        ? 'Якщо відкриєш лист у додатку (Gmail/Instagram/FB), натисни “Відкрити в браузері”.'
        : 'Відкрий посилання у зовнішньому браузері (Chrome/Safari).';

      showModal('Магік-лінк надіслано', (
        <>
          <div>Перевір пошту <b>{email}</b>.</div>
          <div style={{ marginTop: 6 }}>{extra}</div>
          <div style={{ marginTop: 6 }}>
            Після переходу має перекинути на <b>“Обрати виконавця”</b>.
          </div>
        </>
      ));
    } catch (e: any) {
      setHint(e?.message || 'Не вдалося надіслати лист. Спробуй ще раз.');
    } finally {
      setSending(null);
    }
  }

  return (
    <>
      <div className="register-page">
        <form className="register-form" onSubmit={(e) => e.preventDefault()}>
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

          <label htmlFor="ref">Реферальний код (необов’язково)</label>
          <input
            id="ref"
            type="text"
            placeholder="friend123"
            value={refCode}
            onChange={(e) => setRefCode(e.target.value)}
          />

          <button
            type="button"
            disabled={sending !== null || !email}
            onClick={() => sendOtp(true)}
            style={{ marginTop: 12 }}
          >
            {sending === 'reg' ? 'Надсилаємо…' : 'Зареєструватися'}
          </button>

          <button
            type="button"
            disabled={sending !== null || !email}
            onClick={() => sendOtp(false)}
            style={{ marginTop: 8, background: '#ddd' }}
          >
            {sending === 'login' ? 'Надсилаємо…' : 'Увійти'}
          </button>

          {hint && <p className="hint" style={{ marginTop: 10 }}>{hint}</p>}
        </form>
      </div>

      <Modal open={modalOpen} title={modalTitle} onClose={() => setModalOpen(false)}>
        {modalBody}
      </Modal>
    </>
  );
}
