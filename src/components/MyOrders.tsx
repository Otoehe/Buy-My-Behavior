import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  quickOneClickSetup,
  lockFunds,
  confirmCompletionOnChain,
  getDealOnChain,
} from '../lib/escrowContract';
import { pushNotificationManager, useNotifications } from '../lib/pushNotifications';
import { useRealtimeNotifications } from '../lib/realtimeNotifications';
import CelebrationToast from './CelebrationToast';
import './MyOrders.css';

import type { DisputeRow } from '../lib/tables';
import { initiateDispute, getLatestDisputeByScenario } from '../lib/disputeApi';

import ScenarioCard, { Scenario, Status } from './ScenarioCard';
import RateModal from './RateModal';
import { upsertRating } from '../lib/ratings';

// ⬇⬇⬇ ДОДАНО: WalletConnect мобільний провайдер (авто-відкриває MetaMask без вибору Chrome/MM)
import { ensureMobileWalletProvider } from '../lib/walletMobileWC';

const SOUND = new Audio('/notification.wav');
SOUND.volume = 0.8;

async function waitForChainRelease(scenarioId: string, tries = 6, delayMs = 1200): Promise<number> {
  for (let i = 0; i < tries; i++) {
    try {
      const deal = await getDealOnChain(scenarioId);
      const st = Number((deal as any).status);
      if (st === 3 || st === 4) return st;
    } catch {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  return 0;
}

/* ─────────── Mobile helpers ─────────── */
const isMobileUA = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
const hasInjectedEthereum = () => {
  const eth = (window as any).ethereum;
  return !!eth && (!!eth.isMetaMask || !!eth.request);
};

// маленький utility з таймаутом — якщо провайдер завис у “Return to app”
async function withTimeout<T>(p: Promise<T>, ms = 8000, label = 'op'): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout:${label}`)), ms)) as any,
  ]);
}

/** чекаємо, поки вкладка знову стане видимою після повернення з MetaMask app */
function waitUntilVisible(timeoutMs = 15000): Promise<void> {
  if (document.visibilityState === 'visible') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVis);
        resolve();
      }
    };
    const t = setTimeout(() => {
      document.removeEventListener('visibilitychange', onVis);
      reject(new Error('Timeout:visible'));
    }, timeoutMs);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(t);
        onVis();
      }
    });
  });
}

// збережемо інстанс SDK, щоби не створювати щоразу
let __sdk: any | null = null;

/**
 * Гарантовано піднімає **MetaMask SDK** на мобільному, робить **sdk.connect()**,
 * потім **eth_requestAccounts**, **switch/add chain**, і повертає стабільний провайдер.
 * ВАЖЛИВО: викликається у **жесті кліку** перед транзакцією.
 */
async function ensureMobileWalletReady() {
  if (!isMobileUA()) return;

  // 1) ініціалізуємо SDK (навіть якщо інжект вже є — буває “битий” стан без сесії)
  const { default: MetaMaskSDK } = await import('@metamask/sdk');
  if (!__sdk) {
    __sdk = new MetaMaskSDK({
      injectProvider: true,
      preferDesktop: false,                     // критично для мобіли
      useDeeplink: true,                        // відкриває MetaMask і повертає назад у браузер
      communicationLayerPreference: 'webrtc',
      storage: localStorage,                    // стабільніша сесія
      checkInstallationImmediately: false,
      dappMetadata: { name: 'Buy My Behavior', url: window.location.origin },
      modals: { install: false },
    });
    __sdk.getProvider();
  }

  const eth = (window as any).ethereum;

  // 2) явний connect через SDK (це створює сесію “браузер ↔ MetaMask app”)
  try {
    await withTimeout(__sdk.connect(), 15000, 'sdk.connect');
  } catch (_) {
    // навіть якщо connect впав — провайдер може бути ок; підемо далі
  }

  // 3) конект акаунту (у жесті кліку)
  try {
    await withTimeout(eth.request({ method: 'eth_requestAccounts' }), 15000, 'connect');
  } catch (e) {
    // fallback — іноді допомагає на iOS
    try {
      await eth.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch {}
    // і ще раз легкий ping
    try { await eth.request({ method: 'eth_accounts' }); } catch {}
  }

  // чекаємо видимість вкладки у браузері
  try { await waitUntilVisible(15000); } catch {}

  // 4) Перемикання на BSC (56)
  try {
    await withTimeout(
      eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] }),
      15000,
      'switchChain'
    );
  } catch (err: any) {
    if (err?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x38',
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com'],
        }],
      });
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
    } else {
      throw err;
    }
  }

  // 5) перевіримо ланцюг і “розбудимо” провайдера після повернень
  try { await withTimeout(eth.request({ method: 'eth_chainId' }), 4000, 'poke:chain'); } catch {}
  try { await withTimeout(eth.request({ method: 'eth_accounts' }), 4000, 'poke:acc'); } catch {}

  // контрольна перевірка
  const cid = await eth.request({ method: 'eth_chainId' }).catch(() => null);
  if ((cid as string)?.toLowerCase() !== '0x38') {
    throw new Error('Не вдалося перемкнутися на Binance Smart Chain (0x38).');
  }
}

/**
 * ⬇⬇⬇ Гібридна функція: спершу пробує WalletConnect (авто-відкриє MetaMask без вибору),
 * якщо щось пішло не так — падаємо у старий MetaMask SDK як fallback.
 */
async function ensureProviderMobileFirst() {
  if (isMobileUA()) {
    try {
      await ensureMobileWalletProvider(); // WalletConnect v2 → metamask://wc?uri=... (без Chrome)
      return;
    } catch (e) {
      // fallback на MetaMask SDK
      try { await ensureMobileWalletReady(); return; } catch (_) {}
      throw e;
    }
  }
}

/* ─────────── Логіка етапів ─────────── */
const isBothAgreed = (s: Scenario) => !!s.is_agreed_by_customer && !!s.is_agreed_by_executor;
const canEditFields = (s: Scenario) => !isBothAgreed(s) && !s.escrow_tx_hash && s.status !== 'confirmed';

const getStage = (s: Scenario) => {
  if (s.status === 'confirmed') return 3;
  if (s.escrow_tx_hash) return 2;
  if (isBothAgreed(s)) return 1;
  return 0;
};

function StatusStrip({ s }: { s: Scenario }) {
  const stage = getStage(s);
  const dot = (active: boolean) => (
    <span
      style={{
        width: 10, height: 10, borderRadius: 9999,
        display: 'inline-block', margin: '0 6px',
        background: active ? '#111' : '#e5e7eb',
      }}
    />
  );
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 10px', borderRadius: 10,
      background: 'rgba(0,0,0,0.035)', margin: '6px 0 10px',
    }}>
      {dot(stage >= 0)} {dot(stage >= 1)} {dot(stage >= 2)} {dot(stage >= 3)}
      <div style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
        {stage === 0 && '• Угоду погоджено → далі кошти в Escrow'}
        {stage === 1 && '• Погоджено → кошти ще не заблоковані'}
        {stage === 2 && '• Кошти заблоковано → очікуємо виконання'}
        {stage === 3 && '• Виконання підтверджено'}
      </div>
    </div>
  );
}

export default function MyOrders() {
  const [userId, setUserId] = useState('');
  const [list, setList] = useState<Scenario[]>([]);
  const [agreeBusy, setAgreeBusy] = useState<Record<string, boolean>>({});
  const [confirmBusy, setConfirmBusy] = useState<Record<string, boolean>>({});
  const [lockBusy, setLockBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState(false);
  const [openDisputes, setOpenDisputes] = useState<Record<string, DisputeRow | null>>({});
  const [ratedOrders, setRatedOrders] = useState<Set<string>>(new Set());

  const [rateOpen, setRateOpen] = useState(false);
  const [rateFor, setRateFor] = useState<{ scenarioId: string, counterpartyId: string } | null>(null);
  const [rateScore, setRateScore] = useState(10);
  const [rateComment, setRateComment] = useState('');
  const [rateBusy, setRateBusy] = useState(false);

  const { permissionStatus, requestPermission } = useNotifications();
  const rt = useRealtimeNotifications(userId);

  const setLocal = (id: string, patch: Partial<Scenario>) =>
    setList(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));

  const hasCoords = (s: Scenario) =>
    typeof s.latitude === 'number' && Number.isFinite(s.latitude) &&
    typeof s.longitude === 'number' && Number.isFinite(s.longitude);

  const canAgree = (s: Scenario) =>
    !s.escrow_tx_hash && s.status !== 'confirmed' && !s.is_agreed_by_customer;

  const canConfirm = (s: Scenario) => {
    if (!s.escrow_tx_hash) return false;
    if (s.is_completed_by_customer) return false;
    const dt = s.execution_time ? new Date(s.execution_time) : new Date(`${s.date}T${s.time || '00:00'}`);
    return !Number.isNaN(dt.getTime()) && new Date() >= dt;
  };

  const canCustomerRate = (s: Scenario, rated: boolean) =>
    !!(s as any).is_completed_by_executor && !rated;

  const loadOpenDispute = useCallback(async (scenarioId: string) => {
    const d = await getLatestDisputeByScenario(scenarioId);
    setOpenDisputes(prev => ({ ...prev, [scenarioId]: d && d.status === 'open' ? d : null }));
  }, []);

  const load = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .eq('creator_id', uid)
      .order('created_at', { ascending: false });
    if (error) console.error(error);
    setList(((data || []) as Scenario[]).filter(s => s.creator_id === uid));
  }, []);

  const refreshRated = useCallback(async (uid: string, items: Scenario[]) => {
    if (!uid || items.length === 0) { setRatedOrders(new Set()); return; }
    const ids = items.map(s => s.id);
    const { data } = await supabase.from('ratings').select('order_id').eq('rater_id', uid).in('order_id', ids);
    setRatedOrders(new Set((data || []).map((r: any) => r.order_id)));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id; if (!uid) return;
      setUserId(uid);
      await load(uid);

      const ch = supabase
        .channel('realtime:myorders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scenarios' }, async p => {
          const ev = p.eventType as 'INSERT'|'UPDATE'|'DELETE';
          const s = (p as any).new as Scenario | undefined;
          const oldId = (p as any).old?.id as string | undefined;

          setList(prev => {
            if (ev === 'DELETE' && oldId) return prev.filter(x => x.id !== oldId);
            if (!s) return prev;

            if (s.creator_id !== uid) return prev.filter(x => x.id !== s.id);

            const i = prev.findIndex(x => x.id === s.id);
            if (ev === 'INSERT') {
              if (i === -1) return [s, ...prev];
              const cp = [...prev]; cp[i] = { ...cp[i], ...s }; return cp;
            }
            if (ev === 'UPDATE') {
              if (i === -1) return prev;
              const before = prev[i];
              const after = { ...before, ...s };
              if (before.status !== 'confirmed' && after.status === 'confirmed') {
                (async () => {
                  try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
                  await pushNotificationManager.showNotification({
                    title: '🎉 Виконання підтверджено',
                    body: 'Escrow розподілив кошти.',
                    tag: `confirm-${after.id}`,
                    requireSound: true
                  });
                })();
                setToast(true);
              }
              const cp = [...prev]; cp[i] = after; return cp;
            }
            return prev;
          });

          setTimeout(() => refreshRated(uid, (s ? [s] : [])), 0);
        })
        .subscribe();

      const chRatings = supabase
        .channel(`ratings:my:${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings', filter: `rater_id=eq.${uid}` }, async () => {
          await refreshRated(uid, list);
        })
        .subscribe();

      return () => {
        try { supabase.removeChannel(ch); } catch {}
        try { supabase.removeChannel(chRatings); } catch {}
      };
    })();
  }, [load, list, refreshRated]);

  useEffect(() => {
    if (!userId) return;
    refreshRated(userId, list);
    list.forEach(s => { if (s?.id) loadOpenDispute(s.id); });
  }, [userId, list, loadOpenDispute, refreshRated]);

  const handleAgree = async (s: Scenario) => {
    if (agreeBusy[s.id] || !canAgree(s)) return;
    setAgreeBusy(p => ({ ...p, [s.id]: true }));
    try {
      const { data: rec, error } = await supabase
        .from('scenarios')
        .update({ is_agreed_by_customer: true, status: (s.is_agreed_by_executor ? 'agreed' : 'pending') as Status })
        .eq('id', s.id)
        .eq('is_agreed_by_customer', false)
        .select().single();
      if (error && error.code !== 'PGRST116') throw error;
      setLocal(s.id, { is_agreed_by_customer: true, status: rec?.status || s.status });
    } catch (e:any) {
      alert(e?.message || 'Помилка погодження.');
    } finally {
      setAgreeBusy(p => ({ ...p, [s.id]: false }));
    }
  };

  const handleLock = async (s: Scenario) => {
    if (lockBusy[s.id]) return;
    if (!s.donation_amount_usdt || s.donation_amount_usdt <= 0) { alert('Сума має бути > 0'); return; }
    if (!isBothAgreed(s)) { alert('Спершу потрібні дві згоди.'); return; }
    if (s.escrow_tx_hash) return;

    setLockBusy(p => ({ ...p, [s.id]: true }));
    try {
      // === 1) МОБІЛЬНИЙ: спробуємо WalletConnect (авто-відкриє MetaMask без вибору Chrome/MM),
      // якщо не вдалось — fallback на MetaMask SDK
      await ensureProviderMobileFirst();

      const eth = (window as any).ethereum;

      // watchdog/poke, аби “розбудити” провайдера після повернення
      try { await withTimeout(eth.request({ method: 'eth_chainId' }), 4000, 'poke1'); } catch {}
      try { await withTimeout(eth.request({ method: 'eth_accounts' }), 4000, 'poke2'); } catch {}
      try { await waitUntilVisible(15000); } catch {}

      // === 2) “розігрів” (approve за потреби)
      const setup = await quickOneClickSetup();
      if (setup?.approveTxHash) {
        // optional toast
      }

      // ще один poke — деякі прошивки Android цього вимагають
      try { await withTimeout(eth.request({ method: 'eth_accounts' }), 4000, 'poke3'); } catch {}

      // === 3) Транзакція блокування
      const tx = await lockFunds({ amount: Number(s.donation_amount_usdt), scenarioId: s.id });

      await supabase.from('scenarios').update({ escrow_tx_hash: tx?.hash || 'locked', status: 'agreed' }).eq('id', s.id);
      setLocal(s.id, { escrow_tx_hash: (tx?.hash || 'locked') as any, status: 'agreed' });
    } catch (e:any) {
      alert(e?.message || 'Не вдалося заблокувати кошти.');
    } finally {
      setLockBusy(p => ({ ...p, [s.id]: false }));
    }
  };

  const handleConfirm = async (s: Scenario) => {
    if (confirmBusy[s.id] || !canConfirm(s)) return;
    setConfirmBusy(p => ({ ...p, [s.id]: true }));
    try {
      // така сама стратегія: WalletConnect → fallback на MM SDK
      await ensureProviderMobileFirst();
      const eth = (window as any).ethereum;

      try { await withTimeout(eth.request({ method: 'eth_chainId' }), 4000, 'poke4'); } catch {}
      try { await withTimeout(eth.request({ method: 'eth_accounts' }), 4000, 'poke5'); } catch {}
      try { await waitUntilVisible(15000); } catch {}

      await confirmCompletionOnChain({ scenarioId: s.id });
      setLocal(s.id, { is_completed_by_customer: true });

      await supabase.from('scenarios')
        .update({ is_completed_by_customer: true })
        .eq('id', s.id)
        .eq('is_completed_by_customer', false);

      const deal = await getDealOnChain(s.id);
      if (Number((deal as any).status) === 3) {
        await supabase.from('scenarios').update({ status: 'confirmed' }).eq('id', s.id);
        setToast(true);
      } else {
        const st = await waitForChainRelease(s.id);
        if (st === 3) {
          await supabase.from('scenarios').update({ status: 'confirmed' }).eq('id', s.id);
          setToast(true);
        }
      }
    } catch (e:any) {
      alert(e?.message || 'Помилка підтвердження.');
    } finally {
      setConfirmBusy(p => ({ ...p, [s.id]: false }));
    }
  };

  const canDispute = (s: Scenario) =>
    s.status !== 'confirmed' && !!s.escrow_tx_hash && !openDisputes[s.id] && userId === s.creator_id;

  const handleDispute = async (s: Scenario) => {
    try {
      const d = await initiateDispute(s.id);
      setLocal(s.id, { status: 'disputed' } as any);
      setOpenDisputes(prev => ({ ...prev, [s.id]: d }));
    } catch (e:any) {
      alert(e?.message || 'Не вдалося створити спір');
    }
  };

  const openRateFor = (s: Scenario) => {
    setRateScore(10);
    setRateComment('');
    setRateFor({ scenarioId: s.id, counterpartyId: s.executor_id });
    setRateOpen(true);
  };

  const saveRating = async () => {
    if (!rateFor) return;
    setRateBusy(true);
    try {
      await upsertRating({
        scenarioId: rateFor.scenarioId,
        rateeId: rateFor.counterpartyId,
        score: rateScore,
        comment: rateComment,
      });
      setRateOpen(false);
      setRatedOrders(prev => new Set([...Array.from(prev), rateFor.scenarioId]));
      window.dispatchEvent(new CustomEvent('ratings:updated', { detail: { userId: rateFor.counterpartyId } }));
      alert('Рейтинг збережено ✅');
    } catch (e: any) {
      alert(e?.message ?? 'Помилка під час збереження рейтингу');
    } finally {
      setRateBusy(false);
    }
  };

  const headerRight = useMemo(() => (
    <div className="scenario-status-panel">
      <span>🔔 {permissionStatus === 'granted' ? 'Увімкнено' : permissionStatus === 'denied' ? 'Не підключено' : 'Не запитано'}</span>
      <span>📡 {rt.isListening ? `${rt.method} активний` : 'Не підключено'}</span>
      {permissionStatus !== 'granted' && <button className="notify-btn" onClick={requestPermission}>🔔 Дозволити</button>}
    </div>
  ), [permissionStatus, requestPermission, rt.isListening, rt.method]);

  return (
    <div className="scenario-list">
      <div className="scenario-header">
        <h2>Мої замовлення</h2>
        {headerRight}
      </div>

      {list.length === 0 && <div className="empty-hint">Немає активних замовлень.</div>}

      {list.map(s => {
        const bothAgreed = isBothAgreed(s);
        const fieldsEditable = canEditFields(s);
        const rated = ratedOrders.has(s.id);
        const showBigRate = canCustomerRate(s, rated);

        return (
          <div key={s.id} style={{ marginBottom: 18 }}>
            <StatusStrip s={s} />

            <ScenarioCard
              role="customer"
              s={s}

              onChangeDesc={(v) => { if (fieldsEditable) setLocal(s.id, { description: v }); }}
              onCommitDesc={async (v) => {
                if (!fieldsEditable) return;
                await supabase.from('scenarios').update({
                  description: v,
                  status: 'pending',
                  is_agreed_by_customer: false,
                  is_agreed_by_executor: false
                }).eq('id', s.id);
              }}

              onChangeAmount={(v) => { if (fieldsEditable) setLocal(s.id, { donation_amount_usdt: v }); }}
              onCommitAmount={async (v) => {
                if (!fieldsEditable) return;
                if (v !== null && (!Number.isFinite(v) || v <= 0)) {
                  alert('Сума має бути > 0'); setLocal(s.id, { donation_amount_usdt: null }); return;
                }
                await supabase.from('scenarios').update({
                  donation_amount_usdt: v,
                  status: 'pending',
                  is_agreed_by_customer: false,
                  is_agreed_by_executor: false
                }).eq('id', s.id);
              }}

              onAgree={() => handleAgree(s)}
              onLock={() => handleLock(s)}
              onConfirm={() => handleConfirm(s)}
              onDispute={() => handleDispute(s)}

              onOpenLocation={() => {
                if (hasCoords(s)) {
                  window.open(`https://www.google.com/maps?q=${s.latitude},${s.longitude}`, '_blank');
                } else {
                  alert('Локацію ще не встановлено або її не видно. Додайте/перевірте локацію у формі сценарію.');
                }
              }}

              canAgree={canAgree(s)}
              canLock={bothAgreed && !s.escrow_tx_hash}
              canConfirm={canConfirm(s)}
              canDispute={s.status !== 'confirmed' && !!s.escrow_tx_hash && !openDisputes[s.id] && userId === s.creator_id}

              hasCoords={true}
              isRated={rated}
              onOpenRate={() => openRateFor(s)}
            />

            {showBigRate && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => openRateFor(s)}
                  style={{
                    width: '100%', maxWidth: 520, marginTop: 10,
                    padding: '12px 18px', borderRadius: 999,
                    background: '#ffd7e0', color: '#111', fontWeight: 800,
                    border: '1px solid #f3c0ca', cursor: 'pointer',
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.7)',
                  }}
                >
                  ⭐ Оцінити виконавця
                </button>
              </div>
            )}
          </div>
        );
      })}

      <CelebrationToast open={toast} variant="customer" onClose={() => setToast(false)} />

      <RateModal
        open={rateOpen}
        score={rateScore}
        comment={rateComment}
        onChangeScore={setRateScore}
        onChangeComment={setRateComment}
        onCancel={() => setRateOpen(false)}
        onSave={saveRating}
        disabled={rateBusy}
      />
    </div>
  );
}
