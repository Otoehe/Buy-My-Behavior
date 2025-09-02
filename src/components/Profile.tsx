// 📄 src/components/Profile.tsx
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSigner, ensureBSC } from '../lib/web3';
import './UserProfileDrawer.css';

type ProfileRow = {
  user_id: string;
  email?: string;
  username?: string | null;
  role?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  wallet?: string | null;          // ← адреса гаманця
  referral_code?: string | null;
  referred_by?: string | null;
  referrer_wallet?: string | null;
  kyc_verified?: boolean | null;
  created_at?: string;
  updated_at?: string;
};

const PINK = '#ffcdd6';

export default function Profile() {
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDesc, setSavingDesc] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [showInstallHint, setShowInstallHint] = useState(false); // ← банер-підказка
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ───────────────────────────────────────────────────────────────
  // Load session & profile
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUid(user.id);

      const { data, error } = await supabase
        .from<ProfileRow>('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!error && data) setProfile(data);
      setLoading(false);
    })();
  }, []);

  // ───────────────────────────────────────────────────────────────
  // Avatar upload (tap on image) + delete previous
  function onPickAvatar() { fileInputRef.current?.click(); }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;

    // 1) remove previous avatar if existed
    if (profile?.avatar_url) {
      try {
        const prevPath = profile.avatar_url.split('/storage/v1/object/public/')[1];
        if (prevPath) {
          const [bucket, ...rest] = prevPath.split('/');
          const path = rest.join('/');
          await supabase.storage.from(bucket).remove([path]);
        }
      } catch { /* ignore — не критично */ }
    }

    // 2) upload new one
    const ext = file.name.split('.').pop() || 'jpg';
    const objectPath = `${uid}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(objectPath, file, { upsert: true });
    if (upErr) return alert('Помилка завантаження аватару: ' + upErr.message);

    const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(objectPath);

    // 3) save to profile
    const { data, error } = await supabase
      .from<ProfileRow>('profiles')
      .update({ avatar_url: publicUrl.publicUrl })
      .eq('user_id', uid)
      .select()
      .single();

    if (!error && data) setProfile(data);
  }

  // ───────────────────────────────────────────────────────────────
  // Save description on blur
  async function onDescBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    if (!uid) return;
    const value = e.currentTarget.value;
    if (value === profile?.description) return;

    setSavingDesc(true);
    const { data, error } = await supabase
      .from<ProfileRow>('profiles')
      .update({ description: value })
      .eq('user_id', uid)
      .select()
      .single();
    setSavingDesc(false);

    if (error) alert('Не вдалося зберегти опис: ' + error.message);
    else if (data) setProfile(data);
  }

  // ───────────────────────────────────────────────────────────────
  // MetaMask connect (SDK/deeplink) → ensure BSC → save wallet to profiles.wallet
  async function connectMetaMask() {
    try {
      setConnecting(true);
      setShowInstallHint(false); // ховаємо банер перед спробою
      await ensureBSC();
      const signer = await getSigner();
      const addr = await signer.getAddress();

      if (!uid) return;

      const { data, error } = await supabase
        .from<ProfileRow>('profiles')
        .update({ wallet: addr })      // ← зберігаємо у колонку `wallet`
        .eq('user_id', uid)
        .select()
        .single();

      if (error) alert('Не вдалося зберегти адресу в профілі: ' + error.message);
      else if (data) setProfile(data);
    } catch (err: any) {
      // Показуємо банер лише коли підключення не відбулось
      setShowInstallHint(true);
      alert(err?.message || 'Помилка підключення MetaMask');
    } finally {
      setConnecting(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Завантаження профілю…</div>;
  if (!profile) return <div style={{ padding: 16 }}>Профіль не знайдено. Увійди в систему.</div>;

  return (
    <div style={{ padding: '16px 16px 88px 16px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div
          onClick={onPickAvatar}
          style={{
            width: 88, height: 88, borderRadius: '50%', overflow: 'hidden',
            border: `3px solid ${PINK}`, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            cursor: 'pointer', background: '#fff', flexShrink: 0,
          }}
          title="Натисни, щоб змінити фото"
        >
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: '#333', background: '#f7f7f7'
            }}>+</div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Мій профіль</div>
          <div style={{ fontSize: 12, color: '#666' }}>{profile.email || '—'}</div>

          <button
            onClick={connectMetaMask}
            disabled={connecting}
            style={{
              marginTop: 6, padding: '10px 14px', borderRadius: 999, border: 'none',
              background: PINK, color: '#000', fontWeight: 700,
              boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
              display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer'
            }}
          >
            {connecting ? 'Підключення…' : (profile.wallet ? 'Пере-підключити MetaMask' : 'Підключити MetaMask')}
          </button>

          {profile.wallet && (
            <div style={{ fontSize: 12, color: '#444' }}>
              Підключено: <span style={{ fontFamily: 'monospace' }}>{profile.wallet}</span>
            </div>
          )}

          {/* ───── Банер-підказка (показуємо ТІЛЬКИ після невдалої спроби підключення) */}
          {showInstallHint && (
            <div
              style={{
                marginTop: 10,
                background: '#fff',
                border: `1px solid ${PINK}`,
                borderRadius: 14,
                padding: '10px 12px',
                boxShadow: '0 6px 14px rgba(0,0,0,0.06)',
                fontSize: 13,
                lineHeight: 1.35
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Не вдалося відкрити MetaMask
              </div>
              <div style={{ marginBottom: 6 }}>
                Якщо додаток MetaMask не відкрився автоматично, встанови його та повернись у браузер:
              </div>
              <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
                <li><a href="https://metamask.io/download/" target="_blank" rel="noreferrer">metamask.io/download</a></li>
                <li>Android: <a href="https://play.google.com/store/apps/details?id=io.metamask" target="_blank" rel="noreferrer">Google Play</a></li>
                <li>iOS: <a href="https://apps.apple.com/app/metamask/id1438144202" target="_blank" rel="noreferrer">App Store</a></li>
                <li>Desktop: <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">Розширення для Chrome/Brave</a></li>
              </ul>
              <div>
                Після встановлення повернись сюди та натисни «Підключити MetaMask» ще раз.
              </div>
            </div>
          )}
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Ім’я</div>
          <div style={{ fontWeight: 700 }}>{profile.username || 'Без імені'}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Роль</div>
          <div style={{ fontWeight: 700 }}>{profile.role || '—'}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Опиши свої здібності</div>
          <textarea
            defaultValue={profile.description || ''}
            placeholder="Коротко про навички, досвід, що ти пропонуєш…"
            onBlur={onDescBlur}
            rows={4}
            style={{
              width: '100%', borderRadius: 14, border: '1px solid #e8e8e8',
              padding: 12, outline: 'none', fontSize: 14, resize: 'vertical'
            }}
          />
          {savingDesc && <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>Збереження…</div>}
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div><b>Мій реферальний код:</b> {profile.referral_code || '—'}</div>
            <div><b>Амбасадор (referred_by):</b> {profile.referred_by || '—'}</div>
            <div><b>Гаманець амбасадора:</b> {profile.referrer_wallet || '—'}</div>
            <div><b>KYC:</b> {profile.kyc_verified ? 'Пройдено' : 'Не пройдено'}</div>
          </div>
        </div>
      </section>
    </div>
  );
}