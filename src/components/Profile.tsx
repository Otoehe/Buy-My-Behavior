// src/components/Profile.tsx
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import './Profile.css';

/** Ролі (збережено як у попередній версії) */
const roles = [
  'Актор', 'Музикант', 'Авантюрист', 'Платонічний Ескорт', 'Хейтер',
  'Танцівник', 'Бодібілдер-охоронець', 'Філософ', 'Провидець на виїзді',
  'Репортер', 'Пранкер', 'Лицедій (імпровізатор)',
  'Артист дії', 'Інфлюенсер', 'Інше'
] as const;

/* ===========================
   UI: 0..10 зірочок (золото/сірий)
   =========================== */
const RatingStars: React.FC<{ value: number }> = ({ value }) => {
  const rounded = Math.round(value);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: 10 }).map((_, i) => {
        const filled = i < rounded;
        const color = filled ? '#f5c542' : '#e5e7eb';
        return (
          <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15 9 22 9 16.5 13.5 18.5 21 12 16.8 5.5 21 7.5 13.5 2 9 9 9 12 2" />
          </svg>
        );
      })}
    </div>
  );
};

/* ===========================
   MetaMask helpers (всередині функцій — безпечні для білда)
   =========================== */
function waitForEthereum(ms = 3500): Promise<any | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
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
  if (typeof window !== 'undefined') {
    const discovered: any[] = [];
    const onAnnounce = (ev: any) => discovered.push(ev.detail);
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    await new Promise((r) => setTimeout(r, 300));
    window.removeEventListener('eip6963:announceProvider', onAnnounce);

    const mm6963 = discovered.find(
      (d) => d?.provider?.isMetaMask || (d?.info?.rdns || '').toLowerCase().includes('metamask')
    );
    return mm6963?.provider || null;
  }
  return null;
}

async function ensureBSC(provider: any) {
  const BSC = {
    chainId: '0x38', // 56
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org/'],
    blockExplorerUrls: ['https://bscscan.com']
  } as const;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC.chainId }] });
  } catch (e: any) {
    const code = e?.code ?? e?.data?.originalError?.code;
    if (code === 4902) {
      await provider.request({ method: 'wallet_addEthereumChain', params: [BSC] });
    }
  }
}

/* ===========================
   Компонент ПРОФІЛЬ
   =========================== */
type Scenario = { id: number; description: string; price: number; hidden?: boolean };

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState({
    username: '', role: '', description: '', wallet: '', avatar_url: '', email: ''
  });
  const [customRole, setCustomRole] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [newScenarioDescription, setNewScenarioDescription] = useState('');
  const [newScenarioPrice, setNewScenarioPrice] = useState('');
  const [kycCompleted, setKycCompleted] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [ratingAvg, setRatingAvg] = useState<number>(10);
  const [ratingCount, setRatingCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /* ===== 1) Завантаження профілю/драфтів ===== */
  useEffect(() => {
    (async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      if (!mounted.current) return;
      setUser(user);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        const next = {
          username: data.name || '',
          role: data.role || '',
          description: data.description || '',
          wallet: data.wallet || '',
          avatar_url: data.avatar_url || '',
          email: data.email || user.email || ''
        };
        setProfile(next);

        if (data.role === 'Інше') setCustomRole('');
        else if (!roles.includes(data.role)) {
          setProfile((prev) => ({ ...prev, role: 'Інше' }));
          setCustomRole(data.role ?? '');
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
      setScenarios((scenariosData || []) as Scenario[]);
    })();
  }, []);

  /* ===== 2) Прибрати токен у хеші + маркер реєстрації ===== */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash.startsWith('#access_token=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    if (localStorage.getItem('justRegistered') === 'true') {
      localStorage.removeItem('justRegistered');
    }
  }, []);

  /* ===== 3) Переносимо referral з localStorage у БД (перший вхід) ===== */
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

        if (profErr) return;
        if (prof?.referred_by || prof?.referrer_wallet) {
          localStorage.setItem('referral_persisted', 'true');
          return;
        }

        const patch: any = { user_id: user.id };
        if (referred_by) patch.referred_by = referred_by;
        if (referrer_wallet) patch.referrer_wallet = referrer_wallet;

        const { error: upErr } = await supabase.from('profiles').upsert(patch, { onConflict: 'user_id' });
        if (!upErr) localStorage.setItem('referral_persisted', 'true');
      } catch { /* ignore */ }
    })();
  }, []);

  /* ===== 4) Дотягуємо referrer_wallet, якщо відомий referred_by ===== */
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

  /* ===== 5) Геолокація кожні 10с (поки користувач на сторінці) ===== */
  useEffect(() => {
    let intervalId: any = null;
    const tick = async () => {
      try {
        if (!user || typeof navigator === 'undefined' || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            await supabase.from('profiles').update({ latitude, longitude }).eq('user_id', user.id);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
        );
      } catch { /* ignore */ }
    };
    if (user) {
      tick();
      intervalId = setInterval(tick, 10000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [user]);

  /* ===== Аватар ===== */
  const handleAvatarChange = (file: File) => {
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
  };

  /* ===== Зберегти профіль ===== */
  const handleSaveProfile = async () => {
    if (!user) return;
    const selectedRole = profile.role === 'Інше' ? customRole : profile.role;
    let finalAvatarUrl = profile.avatar_url;

    // Якщо є превʼю і файл — вантажимо в bucket 'avatars'
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
      email: profile.email
    } as const;

    const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'user_id' });
    if (!error) alert('✅ Профіль збережено успішно');
    else alert('❌ Помилка при збереженні: ' + JSON.stringify(error, null, 2));
  };

  /* ===== Драфти сценаріїв ===== */
  const handleAddScenario = async () => {
    if (!newScenarioDescription || !newScenarioPrice || !user) return;
    const price = parseFloat(newScenarioPrice);
    if (Number.isNaN(price)) return;
    const { error } = await supabase.from('scenario_drafts').insert([
      { user_id: user.id, description: newScenarioDescription, price }
    ]);
    if (!error) {
      setNewScenarioDescription('');
      setNewScenarioPrice('');
      const { data } = await supabase.from('scenario_drafts').select('*').eq('user_id', user.id);
      setScenarios((data || []) as Scenario[]);
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

  /* ===== MetaMask підключення ===== */
  const connectMetamask = async () => {
    try {
      const provider = await getMetaMaskProvider();
      if (!provider) {
        alert(
          'MetaMask недоступний на цій сторінці.\n' +
          'Перевір: Розширення → MetaMask → Site access → “On all sites”, потім перезавантаж.'
        );
        return;
      }

      const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
      const address = accounts?.[0] || '';
      if (!address) { alert('Користувач не надав доступ до акаунта MetaMask.'); return; }

      setProfile((prev) => ({ ...prev, wallet: address }));
      setWalletConnected(true);

      // Слухач зміни акаунтів (ідемпотентно)
      const prev = (window as any).__bmb_acc_handler__;
      if (prev && typeof prev === 'function' && provider.removeListener) {
        provider.removeListener('accountsChanged', prev);
      }
      const handler = (accs: string[]) => {
        const a = accs?.[0] || '';
        setProfile((p) => ({ ...p, wallet: a }));
        setWalletConnected(Boolean(a));
      };
      (window as any).__bmb_acc_handler__ = handler;
      if (provider.on && typeof provider.on === 'function') {
        provider.on('accountsChanged', handler);
      }

      await ensureBSC(provider);
    } catch (e: any) {
      const msg = e?.code === 4001 ? 'Доступ до акаунта відхилено в MetaMask.' : (e?.message || String(e));
      alert('Помилка підключення MetaMask: ' + msg);
    }
  };

  const UserIcon = () => (
    <svg className="user-icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  const getAvatarUrl = () => avatarPreview || profile.avatar_url || null;

  /* ===== Рендер ===== */
  return (
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

      {/* Додавання сценарію */}
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

      {/* Список сценаріїв */}
      <div className="scenario-archive">
        <h2>📝 Твої сценарії</h2>
        <div className="scenarios-grid">
          {scenarios.filter((s) => !s.hidden).map((s) => (
            <div key={s.id} className="scenario-card">
              <div className="scenario-content">
                <p className="scenario-description">{s.description}</p>
                <span className="scenario-price">{s.price} USDT</span>
              </div>
              <div className="scenario-actions">
                <button className="action-btn hide-btn" onClick={() => handleHideScenario(s.id)}>🙈</button>
                <button className="action-btn delete-btn" onClick={() => handleDeleteScenario(s.id)}>🗑️</button>
              </div>
            </div>
          ))}
          {scenarios.filter((s) => !s.hidden).length === 0 && (
            <div className="empty-scenarios">
              <p>📝 Немає сценаріїв</p>
              <div className="empty-hint">Створи перший сценарій у формі вище</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
