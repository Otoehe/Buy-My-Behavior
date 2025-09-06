// src/components/Profile.tsx
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import './Profile.css';

/** Ролі */
const roles = [
  'Актор', 'Музикант', 'Авантюрист', 'Платонічний Ескорт', 'Хейтер',
  'Танцівник', 'Бодібілдер-охоронець', 'Філософ', 'Провидець на виїзді',
  'Репортер', 'Пранкер', 'Лицедій (імпровізатор)',
  'Артист дії', 'Інфлюенсер', 'Інше'
] as const;

/** PWA beforeinstallprompt */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Зірочки 0..10 */
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

/** ==== MetaMask helpers ==== */
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

  // EIP-6963 multi-inject
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
    chainId: '0x38',
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

/** === Anti -32002 (already pending) === */
type Eip1193Provider = { request: (a: { method: string; params?: any[] | Record<string, any> }) => Promise<any>; on?: any; removeListener?: any };

const MM_LOCK_KEY = 'bmb_mm_lock_v1';
let pendingAccountsPromise: Promise<string[]> | null = null;
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function requestAccountsSafe(provider: Eip1193Provider): Promise<string[]> {
  // 1) Якщо вже є доступ
  let accs = await provider.request({ method: 'eth_accounts' }).catch(() => []) as string[];
  if (accs?.length) return accs;

  // 2) Явний запит
  try {
    accs = await provider.request({ method: 'eth_requestAccounts' }) as string[];
    if (accs?.length) return accs;
  } catch (e: any) {
    if (e?.code === -32002) {
      alert('MetaMask вже відкрив вікно підтвердження. Відкрий MetaMask і дозволь доступ — повторний запит заблоковано.');
      localStorage.setItem(MM_LOCK_KEY, '1');
      // 30s poll eth_accounts (без повторного wallet_requestPermissions)
      for (let i = 0; i < 20; i++) {
        await sleep(1500);
        const a = await provider.request({ method: 'eth_accounts' }).catch(() => []) as string[];
        if (a?.length) {
          localStorage.removeItem(MM_LOCK_KEY);
          return a;
        }
      }
      localStorage.removeItem(MM_LOCK_KEY);
      throw new Error('Підтвердження в MetaMask не завершено.');
    }
    if (e?.code === 4001) throw new Error('Доступ відхилено');
    throw e;
  }
  return accs || [];
}

// Один запит у всій вкладці (реюзимо pending)
async function requestAccountsOnce(provider: Eip1193Provider): Promise<string[]> {
  if (!pendingAccountsPromise) {
    pendingAccountsPromise = requestAccountsSafe(provider).finally(() => { pendingAccountsPromise = null; });
  }
  return pendingAccountsPromise;
}

type Scenario = { id: number; description: string; price: number; hidden?: boolean };

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState({ username: '', role: '', description: '', wallet: '', avatar_url: '', email: '' });
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

  // PWA install state
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  // антидубль-конект
  const [isConnecting, setIsConnecting] = useState(false);
  const connectingRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Якщо повернулись з MetaMask → знімаємо lock і пробуємо дочитати акаунти
  useEffect(() => {
    const tryUnlockFromMM = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!localStorage.getItem(MM_LOCK_KEY)) return;
      const mm = (await getMetaMaskProvider()) as Eip1193Provider | null;
      if (mm) {
        const accs = await mm.request({ method: 'eth_accounts' }).catch(() => []) as string[];
        if (accs?.length) {
          setProfile(p => ({ ...p, wallet: accs[0] }));
          setWalletConnected(true);
        }
      }
      localStorage.removeItem(MM_LOCK_KEY);
      setIsConnecting(false);
      connectingRef.current = false;
    };
    const onFocus = () => { if (localStorage.getItem(MM_LOCK_KEY)) tryUnlockFromMM(); };
    document.addEventListener('visibilitychange', tryUnlockFromMM);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', tryUnlockFromMM);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
    };
  }, []);

  // 1) Профіль + драфти
  useEffect(() => {
    (async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;
      if (!mounted.current) return;
      setUser(user);

      const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (!error && data) {
        setProfile({
          username: data.name || '', role: data.role || '', description: data.description || '',
          wallet: data.wallet || '', avatar_url: data.avatar_url || '', email: data.email || user.email || ''
        });
        if (data.role === 'Інше') setCustomRole('');
        else if (!roles.includes(data.role)) { setProfile((p) => ({ ...p, role: 'Інше' })); setCustomRole(data.role ?? ''); }
        setKycCompleted(Boolean(data.kyc_verified));
        if (data.wallet) setWalletConnected(true);
        setRatingAvg(typeof data.avg_rating === 'number' ? data.avg_rating : 10);
        setRatingCount(typeof data.rating_count === 'number' ? data.rating_count : 0);
      } else {
        setProfile((p) => ({ ...p, email: user.email || '' }));
        await supabase.from('profiles').insert({ user_id: user.id, email: user.email });
      }

      const { data: scenariosData } = await supabase.from('scenario_drafts').select('*').eq('user_id', user.id);
      setScenarios((scenariosData || []) as Scenario[]);
    })();
  }, []);

  // 2) Прибрати токен у хеші + marker реєстрації
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash.startsWith('#access_token=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    if (localStorage.getItem('justRegistered') === 'true') localStorage.removeItem('justRegistered');
  }, []);

  // 3) Referral persist
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
        if (prof?.referred_by || prof?.referrer_wallet) { localStorage.setItem('referral_persisted', 'true'); return; }

        const patch: any = { user_id: user.id };
        if (referred_by) patch.referred_by = referred_by;
        if (referrer_wallet) patch.referrer_wallet = referrer_wallet;
        const { error: upErr } = await supabase.from('profiles').upsert(patch, { onConflict: 'user_id' });
        if (!upErr) localStorage.setItem('referral_persisted', 'true');
      } catch { /* ignore */ }
    })();
  }, []);

  // 4) Дотягуємо referrer_wallet
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('profiles').select('referred_by, referrer_wallet').eq('user_id', user.id).maybeSingle();
      if (me?.referred_by && !me?.referrer_wallet) {
        const { data: amb } = await supabase.from('profiles').select('wallet').eq('user_id', me.referred_by).maybeSingle();
        if (amb?.wallet) await supabase.from('profiles').update({ referrer_wallet: amb.wallet }).eq('user_id', user.id);
      }
    })();
  }, []);

  // 5) Геолокація кожні 10с
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
    if (user) { tick(); intervalId = setInterval(tick, 10000); }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [user]);

  // Аватар
  const handleAvatarChange = (file: File) => { if (!file) return; setAvatarPreview(URL.createObjectURL(file)); };

  // Зберегти профіль
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
      } catch { alert('❌ Помилка завантаження аватара'); }
      finally { setAvatarUploading(false); }
    }

    const updates = {
      user_id: user.id, name: profile.username, role: selectedRole, description: profile.description,
      wallet: profile.wallet, avatar_url: finalAvatarUrl, kyc_verified: kycCompleted, email: profile.email
    } as const;

    const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'user_id' });
    if (!error) alert('✅ Профіль збережено успішно'); else alert('❌ Помилка при збереженні: ' + JSON.stringify(error, null, 2));
  };

  // Драфти сценаріїв
  const handleAddScenario = async () => {
    if (!newScenarioDescription || !newScenarioPrice || !user) return;
    const price = parseFloat(newScenarioPrice); if (Number.isNaN(price)) return;
    const { error } = await supabase.from('scenario_drafts').insert([{ user_id: user.id, description: newScenarioDescription, price }]);
    if (!error) {
      setNewScenarioDescription(''); setNewScenarioPrice('');
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

  // Автосейв гаманця після конекту/зміни акаунта
  const saveWalletIfNeeded = async (address: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('profiles').update({ wallet: address }).eq('user_id', user.id);
    } catch { /* ignore */ }
  };

  // Конект MetaMask з жорстким сінглтоном запиту
  const connectMetamask = async () => {
    if (connectingRef.current || isConnecting) return;
    connectingRef.current = true;
    setIsConnecting(true);
    localStorage.setItem(MM_LOCK_KEY, '1');

    try {
      // 1) Знаходимо провайдера (десктоп або мобільний браузер MetaMask)
      let provider = await getMetaMaskProvider() as Eip1193Provider | null;

      // 2) Якщо не знайдено у звичайному браузері на мобільному — відкриваємо dapp у MetaMask App
      if (!provider && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
        const dappUrl = `${location.host}${location.pathname}${location.search}`;
        location.href = `https://metamask.app.link/dapp/${dappUrl}`;
        return; // далі ініціалізацію робить сам MetaMask App
      }
      if (!provider) {
        alert('MetaMask недоступний. Дозволь доступ у розширенні (Site access → On all sites) і перезавантаж сторінку.');
        return;
      }

      // 3) Єдиний запит на акаунти у вкладці (без дублювання)
      const accounts = await requestAccountsOnce(provider);
      await ensureBSC(provider);

      const address = accounts?.[0] || '';
      if (!address) { alert('Користувач не надав доступ до акаунта MetaMask.'); return; }

      setProfile((prev) => ({ ...prev, wallet: address }));
      setWalletConnected(true);
      saveWalletIfNeeded(address);

      // Підписка на зміну акаунтів
      const prev = (window as any).__bmb_acc_handler__;
      if (prev && provider.removeListener) provider.removeListener('accountsChanged', prev);
      const handler = (accs: string[]) => {
        const a = accs?.[0] || '';
        setProfile((p) => ({ ...p, wallet: a }));
        setWalletConnected(Boolean(a));
        if (a) saveWalletIfNeeded(a);
      };
      (window as any).__bmb_acc_handler__ = handler;
      if (provider.on) provider.on('accountsChanged', handler);
    } catch (e: any) {
      alert('Помилка підключення MetaMask: ' + (e?.message || String(e)));
    } finally {
      localStorage.removeItem(MM_LOCK_KEY);
      setIsConnecting(false);
      connectingRef.current = false;
    }
  };

  const UserIcon = () => (
    <svg className="user-icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
  const getAvatarUrl = () => avatarPreview || profile.avatar_url || null;

  /** Рендер */
  return (
    <div className="profile-container">
      <h1 className="title">Профіль</h1>

      {/* PWA: Add to Home Screen (без змін) */}
      {!installed && (
        <div className="a2hs-card">
          <div className="a2hs-row">
            <div className="a2hs-emoji">📲</div>
            <div className="a2hs-text">
              Додай іконку застосунку на робочий стіл
              <div className="a2hs-sub">Працює офлайн, відкривається як окремий додаток</div>
            </div>
          </div>
          <div className="a2hs-actions">
            <button className="button a2hs-btn" onClick={async () => {
              if (!installEvt) { alert('У вашому браузері встановлення через меню: Install App / Add to Home Screen.'); return; }
              try { await installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); setInstallAvailable(false); } catch {}
            }}>
              <span className="btn-icon" aria-hidden>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ff83b0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2.5" width="14" height="19" rx="3.5"/>
                  <path d="M12 6v8M8 10h8"/>
                </svg>
              </span>
              <span>{installAvailable ? 'Додати іконку' : 'Як додати'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Аватар */}
      <div
        className={`avatar-container ${isDragOver ? 'drag-over' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); const file = e.dataTransfer.files[0]; if (file?.type.startsWith('image/')) handleAvatarChange(file); }}
      >
        {getAvatarUrl() ? (
          <img
            className="avatar-photo"
            src={getAvatarUrl()!}
            alt="Аватар користувача"
            width={192}
            height={192}
            style={{ objectFit: 'cover', cursor: 'pointer', borderRadius: '50%' }}
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
          onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAvatarChange(file); }}
        />
      </div>

      {/* Рейтинг */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 8 }}>
        <RatingStars value={ratingAvg} />
        <span style={{ fontSize: 13, color: '#6b7280' }}>{ratingAvg.toFixed(1)} / 10 · {ratingCount} оцінок</span>
      </div>

      {/* Форма профілю */}
      <div className="profile-form">
        <input placeholder="Ім’я або псевдонім" value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} className="input" />
        <select value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value })} className="input">
          <option value="">Оберіть роль</option>
          {roles.map((role) => (<option key={role} value={role}>{role}</option>))}
        </select>
        {profile.role === 'Інше' && (
          <input type="text" placeholder="Вкажіть власну роль" value={customRole} onChange={(e) => setCustomRole(e.target.value)} className="input" />
        )}
        <textarea placeholder="Опиши свої здібності..." value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} className="input" />
        <input placeholder="TRC20 гаманець або MetaMask" value={profile.wallet} onChange={(e) => setProfile({ ...profile, wallet: e.target.value })} className="input" />

        <button onClick={connectMetamask} className="button" disabled={isConnecting}>
          {isConnecting ? '⏳ Підключення…' : (walletConnected ? '🟢 MetaMask підключено' : '🦊 Підключити MetaMask')}
        </button>
        <button onClick={() => setKycCompleted(true)} className="button">{kycCompleted ? '✅ KYC пройдено' : '🛡 Пройти KYC'}</button>
        <button onClick={handleSaveProfile} className="button">💾 Зберегти профіль</button>
      </div>

      {/* Сценарії */}
      <div className="scenario-form">
        <h2>Створити сценарій</h2>
        <textarea placeholder="Опис сценарію" value={newScenarioDescription} onChange={(e) => setNewScenarioDescription(e.target.value)} className="input" />
        <input type="number" placeholder="Ціна в USDT" value={newScenarioPrice} onChange={(e) => setNewScenarioPrice(e.target.value)} className="input" />
        <button onClick={handleAddScenario} className="button">Зберегти сценарій</button>
      </div>

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
