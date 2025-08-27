// src/components/Profile.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Profile.css';

const roles = [
  'Актор','Музикант','Авантюрист','Платонічний Ескорт','Хейтер',
  'Танцівник','Бодібілдер-охоронець','Філософ','Провидець на виїзді',
  'Репортер','Пранкер','Лицедій (імпровізатор)','Артист дії','Інфлюенсер','Інше'
];

const RatingStars: React.FC<{ value: number }> = ({ value }) => {
  const rounded = Math.round(value);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: 10 }).map((_, i) => {
        const filled = i < rounded;
        const color = filled ? '#f5c542' : '#e5e7eb';
        return (
          <svg
            key={i}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={filled ? color : 'none'}
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 15 9 22 9 16.5 13.5 18.5 21 12 16.8 5.5 21 7.5 13.5 2 9 9 9 12 2" />
          </svg>
        );
      })}
    </div>
  );
};

/* ===== Auth gate (без редіректів) ===== */
const ProfileAuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authReady, setAuthReady] = React.useState(false);
  const [sessionUser, setSessionUser] = React.useState<any>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) setSessionUser(session.user);
      setAuthReady(true);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (cancelled) return;
      if (session) { setSessionUser(session.user); setAuthReady(true); }
    });
    return () => { cancelled = true; try { subscription?.unsubscribe(); } catch {} };
  }, []);

  if (!authReady) {
    return (
      <div className="profile-container">
        <h1 className="title">Профіль</h1>
        <div style={{ padding: 24 }}>Завантаження профілю…</div>
      </div>
    );
  }
  if (!sessionUser) {
    return (
      <div className="profile-container">
        <h1 className="title">Профіль</h1>
        <div style={{ padding: 24 }}>
          Ви ще не авторизовані. Відкрийте лист із магічним посиланням або перейдіть на сторінку «Реєстрація».
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

/* ===== MetaMask helpers ===== */
function waitForEthereum(ms = 3500): Promise<any | null> {
  return new Promise((resolve) => {
    const eth = (window as any).ethereum;
    if (eth) return resolve(eth);
    const onInit = () => resolve((window as any).ethereum);
    window.addEventListener('ethereum#initialized', onInit, { once: true });
    setTimeout(() => {
      window.removeEventListener('ethereum#initialized', onInit);
      resolve((window as any).ethereum || null);
    }, ms);
  });
}

async function getMetaMaskProvider(): Promise<any | null> {
  const eth = await waitForEthereum();
  const candidates = eth?.providers?.length ? eth.providers : (eth ? [eth] : []);
  const mm = candidates?.find((p: any) => p?.isMetaMask) || (eth?.isMetaMask ? eth : null);
  if (mm) return mm;

  // EIP-6963 discovery
  const discovered: any[] = [];
  const onAnnounce = (ev: any) => discovered.push(ev.detail);
  window.addEventListener('eip6963:announceProvider', onAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise((r) => setTimeout(r, 300));
  window.removeEventListener('eip6963:announceProvider', onAnnounce);
  const mm6963 = discovered.find((d) => d?.provider?.isMetaMask || (d?.info?.rdns || '').toLowerCase().includes('metamask'));
  return mm6963?.provider || null;
}

async function ensureBSC(provider: any) {
  const BSC = {
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org/'],
    blockExplorerUrls: ['https://bscscan.com'],
  } as const;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC.chainId }] });
  } catch (e: any) {
    const code = e?.code ?? e?.data?.originalError?.code;
    if (code === 4902) {
      await provider.request({ method: 'wallet_addEthereumChain', params: [BSC] });
    } else {
      console.warn('BSC switch failed:', e);
    }
  }
}

/* ==== Мобільний deeplink у MetaMask (виправлено) ==== */
const isMobileUA = () =>
  /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

// офіційний формат диплінка: https://metamask.app.link/dapp/<domain>
function toDeeplinkUrl() {
  const env = (import.meta as any)?.env?.VITE_PUBLIC_APP_URL as string | undefined;
  const origin = env || window.location.origin;      // напр. https://buy-my-behavior.vercel.app
  const clean  = origin.replace(/^https?:\/\//i, ''); // buy-my-behavior.vercel.app
  return `https://metamask.app.link/dapp/${clean}`;
}

export default function Profile() {
  const navigate = useNavigate();

  // ⬅️ ГАСИМО залишкові редіректи одразу після монтування (щоб не тягнуло назад на /profile)
  useEffect(() => {
    try {
      localStorage.removeItem('post_auth_next');
      localStorage.removeItem('justRegistered');
    } catch {}
  }, []);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState({
    username: '', role: '', description: '', wallet: '', avatar_url: '', email: ''
  });
  const [customRole, setCustomRole] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [newScenarioDescription, setNewScenarioDescription] = useState('');
  const [newScenarioPrice, setNewScenarioPrice] = useState('');
  const [kycCompleted, setKycCompleted] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [ratingAvg, setRatingAvg] = useState<number>(10);
  const [ratingCount, setRatingCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;
      setUser(user);
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setProfile({
          username: data.name || '',
          role: data.role || '',
          description: data.description || '',
          wallet: data.wallet || '',
          avatar_url: data.avatar_url || '',
          email: data.email || user.email || '',
        });

        if (data.role === 'Інше') setCustomRole('');
        else if (!roles.includes(data.role)) {
          setProfile((prev) => ({ ...prev, role: 'Інше' }));
          setCustomRole(data.role);
        }

        setKycCompleted(Boolean(data.kyc_verified));
        if (data.wallet) setWalletConnected(true);
        setRatingAvg(typeof data.avg_rating === 'number' ? data.avg_rating : 10);
        setRatingCount(typeof data.rating_count === 'number' ? data.rating_count : 0);
      } else {
        setProfile((prev) => ({ ...prev, email: user.email || '' }));
        await supabase.from('profiles').insert({ user_id: user.id, email: user.email });
      }

      const { data: scenariosData } = await supabase
        .from('scenario_drafts')
        .select('*')
        .eq('user_id', user.id);
      setScenarios(scenariosData || []);
    };

    fetchProfile();
  }, []);

  // Очищення hash ПІСЛЯ того, як сесія вже є
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (
        session &&
        (window.location.hash.includes('access_token=') || window.location.hash.includes('refresh_token='))
      ) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    })();

    if (localStorage.getItem('justRegistered') === 'true') {
      localStorage.removeItem('justRegistered');
    }
  }, []);

  // Реферал → БД (разово)
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        if (localStorage.getItem('referral_persisted') === 'true') return;

        const referred_by = localStorage.getItem('referred_by');
        const referrer_wallet = localStorage.getItem('referrer_wallet');
        if (!referred_by && !referrer_wallet) return;

        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('referred_by, referrer_wallet')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profErr) { console.warn('Referral fetch error:', profErr); return; }
        if (prof?.referred_by || prof?.referrer_wallet) {
          localStorage.setItem('referral_persisted', 'true');
          return;
        }

        const patch: any = { user_id: user.id };
        if (referred_by) patch.referred_by = referred_by;
        if (referrer_wallet) patch.referrer_wallet = referrer_wallet;

        const { error: upErr } = await supabase
          .from('profiles')
          .upsert(patch, { onConflict: 'user_id' });

        if (upErr) { console.warn('Referral upsert error:', upErr); return; }

        localStorage.setItem('referral_persisted', 'true');
      } catch (e) {
        console.warn('Referral persist warning:', e);
      }
    })();
  }, []);

  // Якщо є referred_by, а referrer_wallet ще нема — дотягуємо
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: me } = await supabase
        .from('profiles')
        .select('referred_by, referrer_wallet')
        .eq('user_id', user.id)
        .maybeSingle();

      if (me?.referred_by && !me?.referrer_wallet) {
        const { data: amb } = await supabase
          .from('profiles')
          .select('wallet')
          .eq('user_id', me.referred_by)
          .maybeSingle();

        if (amb?.wallet) {
          await supabase
            .from('profiles')
            .update({ referrer_wallet: amb.wallet })
            .eq('user_id', user.id);
        }
      }
    })();
  }, []);

  // Координати
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    const fetchAndUpdatePosition = () => {
      if (navigator.geolocation && user) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            await supabase
              .from('profiles')
              .update({ latitude, longitude })
              .eq('user_id', user.id);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
        );
      }
    };
    if (user) {
      fetchAndUpdatePosition();
      intervalId = setInterval(fetchAndUpdatePosition, 10000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [user]);

  const handleAvatarChange = (file: File) => {
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    const selectedRole = profile.role === 'Інше' ? customRole : profile.role;
    let finalAvatarUrl = profile.avatar_url;

    if (avatarPreview && fileInputRef.current?.files?.[0]) {
      setAvatarUploading(true);
      try {
        const file = fileInputRef.current.files[0];
        const { data, error } = await supabase.storage
          .from('avatars')
          .upload(`${user.id}.jpg`, file, { cacheControl: '0', upsert: true });
        if (!error && data) {
          const { data: pub } = supabase.storage.from('avatars').getPublicUrl(data.path);
          finalAvatarUrl = `${pub.publicUrl}?t=${Date.now()}`;
          setProfile(prev => ({ ...prev, avatar_url: finalAvatarUrl }));
          setAvatarPreview('');
        }
      } catch {
        alert('❌ Помилка завантаження аватара');
      } finally {
        setAvatarUploading(false);
      }
    }

    const updates = {
      user_id: user.id,
      name: profile.username,
      role: selectedRole,
      description: profile.description,
      wallet: profile.wallet,
      avatar_url: finalAvatarUrl,
      kyc_verified: kycCompleted,
      email: profile.email,
    } as const;

    const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'user_id' });
    if (!error) {
      alert('✅ Профіль збережено успішно');
      navigate('/map', { replace: true }); // після збереження ведемо на "Вибрати виконавця"
    } else {
      alert('❌ Помилка при збереженні: ' + JSON.stringify(error, null, 2));
    }
  };

  const handleAddScenario = async () => {
    if (!newScenarioDescription || !newScenarioPrice || !user) return;
    const { error } = await supabase.from('scenario_drafts').insert([
      { user_id: user.id, description: newScenarioDescription, price: parseFloat(newScenarioPrice) },
    ]);
    if (!error) {
      setNewScenarioDescription('');
      setNewScenarioPrice('');
      const { data } = await supabase.from('scenario_drafts').select('*').eq('user_id', user.id);
      setScenarios(data || []);
    }
  };

  const handleDeleteScenario = async (id: number) => {
    const { error } = await supabase.from('scenario_drafts').delete().eq('id', id);
    if (!error) setScenarios(scenarios.filter((s) => s.id !== id));
  };

  const handleHideScenario = async (id: number) => {
    const { error } = await supabase.from('scenario_drafts').update({ hidden: true }).eq('id', id);
    if (!error) setScenarios(scenarios.map((s) => (s.id === id ? { ...s, hidden: true } : s)));
  };

  const connectMetamask = async () => {
    try {
      // 1) Спробувати інжектований MetaMask (десктоп або мобільний in-app браузер)
      const provider = await getMetaMaskProvider();
      if (provider) {
        const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
        const address = accounts?.[0] || '';
        if (!address) { alert('Користувач не надав доступ до акаунта MetaMask.'); return; }

        setProfile((prev) => ({ ...prev, wallet: address }));
        setWalletConnected(true);

        const prev = (window as any).__bmb_acc_handler__;
        if (prev && typeof prev === 'function' && (provider as any).removeListener) {
          (provider as any).removeListener('accountsChanged', prev);
        }
        const handler = (accs: string[]) => {
          const a = accs?.[0] || '';
          setProfile((p) => ({ ...p, wallet: a }));
          setWalletConnected(Boolean(a));
        };
        (window as any).__bmb_acc_handler__ = handler;
        if ((provider as any).on && typeof (provider as any).on === 'function') {
          (provider as any).on('accountsChanged', handler);
        }

        await ensureBSC(provider);
        return;
      }

      // 2) Якщо інжекції немає і це МОБІЛЬНИЙ браузер → відкриваємо MetaMask через deeplink
      if (isMobileUA()) {
        window.location.href = toDeeplinkUrl(); // відкриє MetaMask Mobile та завантажить ваш сайт у ньому
        return;
      }

      // 3) Немає MetaMask
      alert('MetaMask недоступний. Встановіть розширення MetaMask (десктоп) або відкрийте сайт через MetaMask Mobile.');
    } catch (e: any) {
      const msg = e?.code === 4001 ? 'Доступ до акаунта відхилено в MetaMask.' : (e?.message || String(e));
      console.error('MetaMask connect error:', e);
      alert('Помилка підключення MetaMask: ' + msg);
    }
  };

  const getAvatarUrl = () => avatarPreview || profile.avatar_url || null;

  const UserIcon = () => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  return (
    <ProfileAuthGate>
      <main className="profile-page">
        <div className="profile-container">
          <h1 className="title">Профіль</h1>

          {/* Аватар */}
          <div
            className={`avatar-container ${isDragOver ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault(); setIsDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith('image/')) handleAvatarChange(file);
            }}
          >
            {getAvatarUrl() ? (
              <img
                src={getAvatarUrl()!}
                alt="Аватар користувача"
                width={192}
                height={192}
                style={{ borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
              />
            ) : (
              <div className="avatar-placeholder">
                <UserIcon />
                <span>Додати фото</span>
              </div>
            )}

            {avatarUploading && <div className="avatar-uploading-spinner"></div>}

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarChange(file);
              }}
            />
          </div>

          {/* Рейтинг */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 8 }}>
            <RatingStars value={ratingAvg} />
            <span style={{ fontSize: 13, color: '#6b7280' }}>{ratingAvg.toFixed(1)} / 10 · {ratingCount} оцінок</span>
          </div>

          {/* Форма профілю */}
          <div className="profile-form">
            <input
              placeholder="Ім’я або псевдонім"
              value={profile.username}
              onChange={(e) => setProfile({ ...profile, username: e.target.value })}
              className="input"
            />

            <select
              value={profile.role}
              onChange={(e) => setProfile({ ...profile, role: e.target.value })}
              className="input"
            >
              <option value="">Оберіть роль</option>
              {roles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>

            {profile.role === 'Інше' && (
              <input
                type="text"
                placeholder="Вкажіть власну роль"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                className="input"
              />
            )}

            <textarea
              placeholder="Опиши свої здібності..."
              value={profile.description}
              onChange={(e) => setProfile({ ...profile, description: e.target.value })}
              className="input"
            />

            <input
              placeholder="TRC20 гаманець або MetaMask"
              value={profile.wallet}
              onChange={(e) => setProfile({ ...profile, wallet: e.target.value })}
              className="input"
            />

            <button onClick={connectMetamask} className="button">
              {walletConnected ? '🟢 MetaMask підключено' : '🦊 Підключити MetaMask'}
            </button>

            <button onClick={() => setKycCompleted(true)} className="button">
              {kycCompleted ? '✅ KYC пройдено' : '🛡 Пройти KYC'}
            </button>

            <button onClick={handleSaveProfile} className="button">💾 Зберегти профіль</button>
          </div>

          {/* Драфти сценаріїв */}
          <div className="scenario-form">
            <h2>Створити сценарій</h2>
            <textarea
              placeholder="Опис сценарію"
              value={newScenarioDescription}
              onChange={(e) => setNewScenarioDescription(e.target.value)}
              className="input"
            />
            <input
              type="number"
              placeholder="Ціна в USDT"
              value={newScenarioPrice}
              onChange={(e) => setNewScenarioPrice(e.target.value)}
              className="input"
            />
            <button onClick={handleAddScenario} className="button">Зберегти сценарій</button>
          </div>

          <div className="scenario-archive">
            <h2>📝 Твої сценарії</h2>
            <div className="scenarios-grid">
              {scenarios.filter((s) => !s.hidden).map((s) => (
                <div key={s.id} className="scenario-card">
                  <div className="scenario-content">
                    <p>{s.description}</p>
                    <span>{s.price} USDT</span>
                  </div>
                  <div className="scenario-actions">
                    <button onClick={() => handleHideScenario(s.id)}>🙈</button>
                    <button onClick={() => handleDeleteScenario(s.id)}>🗑️</button>
                  </div>
                </div>
              ))}
              {scenarios.filter((s) => !s.hidden).length === 0 && (
                <p>📝 Немає сценаріїв</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </ProfileAuthGate>
  );
}
