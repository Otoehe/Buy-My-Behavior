// src/components/Profile.tsx
import React, { useEffect, useRef, useState } from 'react';
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
          <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="1.5">
            <polygon points="12 2 15 9 22 9 16.5 13.5 18.5 21 12 16.8 5.5 21 7.5 13.5 2 9 9 9 12 2" />
          </svg>
        );
      })}
    </div>
  );
};

/* ===== локальні MetaMask helper-и (не чіпають lib/web3) ===== */
function waitForEthereum(ms = 3500): Promise<any | null> {
  return new Promise((resolve) => {
    const eth = (window as any).ethereum;
    if (eth) return resolve(eth);
    const onInit = () => resolve((window as any).ethereum);
    window.addEventListener('ethereum#initialized', onInit, { once: true });
    setTimeout(() => { window.removeEventListener('ethereum#initialized', onInit); resolve((window as any).ethereum || null); }, ms);
  });
}
async function getMetaMaskProvider(): Promise<any | null> {
  const eth = await waitForEthereum();
  const candidates = eth?.providers?.length ? eth.providers : (eth ? [eth] : []);
  const mm = candidates?.find((p: any) => p?.isMetaMask) || (eth?.isMetaMask ? eth : null);
  if (mm) return mm;
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
    blockExplorerUrls: ['https://bscscan.com']
  } as const;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC.chainId }] });
  } catch (e: any) {
    if ((e?.code ?? e?.data?.originalError?.code) === 4902) {
      await provider.request({ method: 'wallet_addEthereumChain', params: [BSC] });
    }
  }
}

const ProfileAuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [u, setU] = useState<any>(null);
  useEffect(() => {
    let off = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!off) { setU(session?.user || null); setReady(true); }
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setU(session?.user || null); setReady(true);
    });
    return () => { try { subscription?.unsubscribe(); } catch {} off = true; };
  }, []);
  if (!ready) return <div className="profile-container"><h1 className="title">Профіль</h1><div>Завантаження...</div></div>;
  if (!u) return <div className="profile-container"><h1 className="title">Профіль</h1><div>Авторизуйся через magic link.</div></div>;
  return <>{children}</>;
};

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState({ username: '', role: '', description: '', wallet: '', avatar_url: '', email: '' });
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
    (async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return;
      setUser(user);

      const { data, error: pErr } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (!pErr && data) {
        setProfile({
          username: data.name || '', role: data.role || '', description: data.description || '',
          wallet: data.wallet || '', avatar_url: data.avatar_url || '', email: data.email || user.email || ''
        });
        if (data.role === 'Інше') setCustomRole('');
        else if (!roles.includes(data.role)) { setProfile((p) => ({ ...p, role: 'Інше' })); setCustomRole(data.role); }
        setKycCompleted(!!data.kyc_verified);
        setWalletConnected(!!data.wallet);
        setRatingAvg(typeof data.avg_rating === 'number' ? data.avg_rating : 10);
        setRatingCount(typeof data.rating_count === 'number' ? data.rating_count : 0);
      } else {
        setProfile((p) => ({ ...p, email: user.email || '' }));
        await supabase.from('profiles').insert({ user_id: user.id, email: user.email });
      }

      const { data: drafts } = await supabase.from('scenario_drafts').select('*').eq('user_id', user.id);
      setScenarios(drafts || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && (location.hash.includes('access_token=') || location.hash.includes('refresh_token='))) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    })();
    if (localStorage.getItem('justRegistered') === 'true') localStorage.removeItem('justRegistered');
  }, []);

  // coords (раз на 10с)
  useEffect(() => {
    let t: any;
    const tick = () => {
      if (!user || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        await supabase.from('profiles').update({ latitude, longitude }).eq('user_id', user.id);
      });
    };
    if (user) { tick(); t = setInterval(tick, 10000); }
    return () => t && clearInterval(t);
  }, [user]);

  const handleAvatarChange = (file: File) => { if (file) setAvatarPreview(URL.createObjectURL(file)); };

  const handleSaveProfile = async () => {
    if (!user) return;
    const selectedRole = profile.role === 'Інше' ? customRole : profile.role;
    let finalAvatarUrl = profile.avatar_url;

    if (avatarPreview && fileInputRef.current?.files?.[0]) {
      setAvatarUploading(true);
      try {
        const file = fileInputRef.current.files[0];
        const { data, error } = await supabase.storage.from('avatars').upload(`${user.id}.jpg`, file, { cacheControl: '0', upsert: true });
        if (!error && data) {
          const { data: pub } = supabase.storage.from('avatars').getPublicUrl(data.path);
          finalAvatarUrl = `${pub.publicUrl}?t=${Date.now()}`;
          setProfile(prev => ({ ...prev, avatar_url: finalAvatarUrl }));
          setAvatarPreview('');
        }
      } finally { setAvatarUploading(false); }
    }

    await supabase.from('profiles').upsert({
      user_id: user.id,
      name: profile.username,
      role: selectedRole,
      description: profile.description,
      wallet: profile.wallet,
      avatar_url: finalAvatarUrl,
      kyc_verified: kycCompleted,
      email: profile.email
    }, { onConflict: 'user_id' });

    alert('✅ Профіль збережено');
  };

  const handleAddScenario = async () => {
    if (!newScenarioDescription || !newScenarioPrice || !user) return;
    const price = parseFloat(newScenarioPrice);
    const { error } = await supabase.from('scenario_drafts').insert([{ user_id: user.id, description: newScenarioDescription, price }]);
    if (!error) {
      setNewScenarioDescription(''); setNewScenarioPrice('');
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
      const provider = await getMetaMaskProvider();
      if (!provider) { alert('MetaMask недоступний.\nДай доступ сайту в налаштуваннях розширення і перезавантаж.'); return; }
      const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
      const address = accounts?.[0] || '';
      if (!address) { alert('Користувач відхилив доступ до акаунта.'); return; }
      setProfile((p) => ({ ...p, wallet: address })); setWalletConnected(true);

      const prev = (window as any).__bmb_acc_handler__;
      if (prev && provider.removeListener) provider.removeListener('accountsChanged', prev);
      const handler = (accs: string[]) => {
        const a = accs?.[0] || '';
        setProfile((p) => ({ ...p, wallet: a })); setWalletConnected(!!a);
      };
      (window as any).__bmb_acc_handler__ = handler;
      provider.on?.('accountsChanged', handler);

      await ensureBSC(provider);
    } catch (e: any) {
      alert('Помилка підключення MetaMask: ' + (e?.message || String(e)));
    }
  };

  const avatarUrl = avatarPreview || profile.avatar_url || '';

  return (
    <ProfileAuthGate>
      <div className="profile-container">
        <h1 className="title">Профіль</h1>

        {/* АВАТАР з новим дизайном */}
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
          <div className="avatar-circle">
            {avatarUrl ? (
              <img className="avatar-image" src={avatarUrl} alt="Аватар" />
            ) : (
              <div className="avatar-placeholder" style={{ width: 140, height: 140, borderRadius: '50%', border: '2px dashed #e2e8f0', display:'grid', placeItems:'center', background:'#fff' }}>
                <svg className="user-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span style={{ marginTop: 6, fontSize: 12, color:'#495057', fontWeight:600 }}>Додати фото</span>
              </div>
            )}

            {/* overlay-хінт */}
            <div className="avatar-overlay">
              <div className="upload-icon">⬆️</div>
              <div className="upload-hint">Натисни або перетягни<br/>щоб змінити фото</div>
            </div>

            {/* loader */}
            {avatarUploading && (
              <div className="avatar-loader">
                <div className="loader-spinner" />
              </div>
            )}
          </div>

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

        {/* ФОРМА ПРОФІЛЮ */}
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
            {roles.map((role) => <option key={role} value={role}>{role}</option>)}
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
            rows={4}
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

        {/* СТВОРЕННЯ СЦЕНАРІЮ */}
        <div className="scenario-form">
          <h2 className="subtitle">Створити сценарій</h2>
          <textarea
            placeholder="Опис сценарію"
            value={newScenarioDescription}
            onChange={(e) => setNewScenarioDescription(e.target.value)}
            className="input"
            rows={3}
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

        {/* СПИСОК СЦЕНАРІЇВ */}
        <div className="scenario-archive">
          <h2 className="subtitle">📝 Твої сценарії</h2>
          <div className="scenarios-grid">
            {scenarios.filter((s) => !s.hidden).map((s) => (
              <div key={s.id} className="scenario-card">
                <div className="scenario-content">
                  <p className="scenario-description">{s.description}</p>
                  <span className="scenario-price">{s.price} USDT</span>
                </div>
                <div className="scenario-actions">
                  <button className="action-btn hide-btn" title="Приховати" onClick={() => handleHideScenario(s.id)}>🙈</button>
                  <button className="action-btn delete-btn" title="Видалити" onClick={() => handleDeleteScenario(s.id)}>🗑️</button>
                </div>
              </div>
            ))}
            {scenarios.filter((s) => !s.hidden).length === 0 && (
              <div className="empty-scenarios">
                <p>Немає сценаріїв</p>
                <div className="empty-hint">Створи перший у формі вище</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProfileAuthGate>
  );
}
