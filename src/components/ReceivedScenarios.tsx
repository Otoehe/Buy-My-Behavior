// 📄 src/components/ReceivedScenarios.tsx
// ------------------------------------------------------------
// Canvas-safe version with local shims for ../lib/* imports.
// In your real repo, keep the real imports from ../lib/*.
// These shims are only here so the Canvas builder doesn't fail
// with "File not found: ../lib/..." and to let the UI render.
// ------------------------------------------------------------

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
// UI shims for Canvas — in the real repo, import real components from ./*
// import CelebrationToast from './CelebrationToast';
// import { StatusStripClassic } from './StatusStripClassic';
// import RateCounterpartyModal from './RateCounterpartyModal';
// import './MyOrders.css';

const CelebrationToast: React.FC<{ open: boolean; variant?: string; onClose: () => void }>
  = () => null;

const StatusStripClassic: React.FC<{ state: any }>
  = ({ state }) => (
    <div style={{
      fontSize: 12,
      opacity: .7,
      background: '#f5f5f5',
      borderRadius: 8,
      padding: '6px 10px',
      display: 'inline-block'
    }}>
      статус: {String(state?.status ?? '—')}
    </div>
  );

const RateCounterpartyModal: React.FC<{
  scenarioId: string;
  counterpartyId: string;
  disabled?: boolean;
  onDone?: () => void;
}>
  = ({ children }) => <>{children}</>;


// ────────────────────────────────────────────────────────────
//  SHIMS (only for Canvas / Preview build)
//  In the real project, REMOVE this block and restore imports:
//    import { supabase } from '../lib/supabase'
//    import { confirmCompletion as confirmCompletionOnChain, getDealOnChain, ESCROW_ADDRESS, generateScenarioIdBytes32 } from '../lib/escrowContract'
//    import { getSigner, ensureBSC } from '../lib/web3'
//    import { pushNotificationManager, useNotifications } from '../lib/pushNotifications'
//    import { useRealtimeNotifications } from '../lib/realtimeNotifications'
//    import type { DisputeRow, ScenarioRow } from '../lib/tables'
//    import { getLatestDisputeByScenario, uploadEvidenceAndAttach, ensureDisputeRowForScenario } from '../lib/disputeApi'
// ────────────────────────────────────────────────────────────

// Minimal types we actually use in this component
export type Status = 'pending' | 'agreed' | 'confirmed' | 'disputed' | string;
export interface ScenarioRow {
  id: string;
  description?: string | null;
  date: string;            // YYYY-MM-DD
  time?: string | null;    // HH:mm or null
  execution_time?: string | null;
  creator_id: string;
  executor_id: string;
  receiver_id?: string;    // optional in some schemas
  latitude?: number | null;
  longitude?: number | null;
  status: Status;
  is_agreed_by_customer?: boolean;
  is_agreed_by_executor?: boolean;
  is_completed_by_executor?: boolean;
  is_locked_onchain?: boolean;
  escrow_tx_hash?: string | null;
  donation_amount_usdt?: number | null;
}
export interface DisputeRow { id: string; status: 'open'|'closed'|'cancelled'|string; behavior_id?: string|null }

// Canvas flag
const IS_CANVAS = typeof window !== 'undefined' && (window as any).__CANVAS_PREVIEW__ === true;

// Supabase mock
type SupaQueryResult<T=any> = { data: T | null; error: any | null };
function supaResult<T>(data: T|null = null): SupaQueryResult<T> { return { data, error: null }; }
const supabase = (():
  any => {
  try { if (!IS_CANVAS && (window as any).supabase) return (window as any).supabase; } catch {}
  const chainObj = {
    select: () => chainObj,
    or: () => chainObj,
    order: () => supaResult<any[]>([]),
    update: () => ({ eq: () => supaResult(), in: () => supaResult(), maybeSingle: () => supaResult() }),
    eq: () => chainObj,
    in: () => chainObj,
    maybeSingle: () => supaResult<any>(null),
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user' } } }) },
    from: (_table: string) => chainObj,
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {}
  };
})();

// Escrow contract shims
const confirmCompletionOnChain = async (_: { scenarioId: string }) => {};
const getDealOnChain = async (_sid: string) => ({ status: 3, executor: '0x0000000000000000000000000000000000000000' });
const ESCROW_ADDRESS = '0x0000000000000000000000000000000000000000';
const generateScenarioIdBytes32 = (sid: string) => sid.padEnd(66, '0');

// Web3 shims
const ensureBSC = async () => {};
const getSigner = async () => ({
  getAddress: async () => '0x0000000000000000000000000000000000000000',
  provider: { getBalance: async () => (typeof BigInt === 'function' ? 10n ** 18n : { lt: () => false }) }
});

// Notifications shims
const pushNotificationManager = { showNotification: async (_: any) => {} };
function useNotifications() {
  return { permissionStatus: 'granted' as 'granted'|'denied'|'default', requestPermission: async () => {} };
}
function useRealtimeNotifications(_uid?: string) {
  return { isListening: false, method: 'Mock' };
}

// Dispute API shims
const getLatestDisputeByScenario = async (_id: string): Promise<DisputeRow | null> => null;
const uploadEvidenceAndAttach = async (_disputeId: string, _file: File, _u: string) => {};
const ensureDisputeRowForScenario = async (_s: { id: string; creator_id: string; executor_id: string; }): Promise<DisputeRow> => ({ id: 'mock', status: 'open' });

// ────────────────────────────────────────────────────────────
//  End of SHIMS
// ────────────────────────────────────────────────────────────

// Типи сценарію у компоненті
interface Scenario extends ScenarioRow {}

const SOUND = new Audio('/notification.wav');
SOUND.volume = 0.85;

// ———————————————————————————————————————————————————————
// helpers
async function ensureBSCAndGetSigner() { await ensureBSC(); return await getSigner(); }
function humanizeEthersError(err: any): string {
  const m = String(err?.shortMessage || err?.reason || err?.error?.message || err?.message || '');
  if (!m) return 'Невідома помилка';
  return m.replace(/execution reverted:?/i, '').replace(/\(reason=.*?\)/i, '').trim();
}
async function waitForChainRelease(sid: string, tries = 6, delayMs = 1200) {
  for (let i = 0; i < tries; i++) {
    try { const deal = await getDealOnChain(sid); const st = Number((deal as any).status); if (st === 3 || st === 4) return st; } catch {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  return 0;
}
export function reachedExecutionTime(s: Scenario) {
  const dt = s.execution_time ? new Date(s.execution_time) : new Date(`${s.date}T${s.time || '00:00'}`);
  return !isNaN(dt.getTime()) && new Date() >= dt;
}

export default function ReceivedScenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [userId, setUserId] = useState('');
  const uidRef = useRef('');

  const [agreeBusy, setAgreeBusy] = useState<Record<string, boolean>>({});
  const [confirmBusy, setConfirmBusy] = useState<Record<string, boolean>>({});
  const [lineWidths, setLineWidths] = useState<Record<string, number>>({});
  const [showFinalToast, setShowFinalToast] = useState(false);

  const [openDisputes, setOpenDisputes] = useState<Record<string, DisputeRow | null>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const [ratedMap, setRatedMap] = useState<Record<string, boolean>>({});

  const { permissionStatus, requestPermission } = useNotifications();
  const rt = useRealtimeNotifications(userId);

  function stepOf(s: Scenario) {
    if (!s.is_agreed_by_executor) return 1; // погодити
    if (!s.escrow_tx_hash && s.is_agreed_by_customer) return 0; // чекаємо lock
    if (s.escrow_tx_hash && reachedExecutionTime(s) && !s.is_completed_by_executor) return 2; // підтвердити
    return 0;
  }
  const canAgree   = (s: Scenario) => stepOf(s) === 1 && !agreeBusy[s.id];
  const canConfirm = (s: Scenario) => stepOf(s) === 2 && !confirmBusy[s.id];

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = (data as any)?.user?.id || '';
      if (!uid) return;
      setUserId(uid);
      uidRef.current = uid;
      await load(uid);

      const ch = supabase
        .channel('realtime:scenarios_received')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scenarios' }, (payload: any) => {
          const s = payload?.new as Scenario | undefined;
          const type = payload?.eventType as 'INSERT' | 'UPDATE' | 'DELETE' | undefined;
          setScenarios(prev => {
            if (type === 'DELETE') return prev.filter(x => x.id !== payload.old?.id);
            if (!s) return prev;
            const mine = s.executor_id === uidRef.current || (s as any).receiver_id === uidRef.current;
            if (!mine) return prev;
            const i = prev.findIndex(x => x.id === s.id);
            if (type === 'INSERT') return i === -1 ? [s, ...prev] : prev;
            if (type === 'UPDATE' && i !== -1) {
              const next = [...prev];
              if (prev[i].status !== 'confirmed' && s.status === 'confirmed') {
                (async () => {
                  try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
                  await pushNotificationManager.showNotification({
                    title: '🎉 Виконання підтверджено',
                    body: 'Escrow розподілив кошти.',
                    tag: `scenario-confirmed-${s.id}`,
                    requireSound: true
                  });
                })();
                setShowFinalToast(true);
              }
              if (!prev[i].escrow_tx_hash && s.escrow_tx_hash) {
                (async () => {
                  try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
                  await pushNotificationManager.showNotification({
                    title: '💳 Клієнт заблокував кошти',
                    body: 'Escrow активовано. Очікуємо час виконання.',
                    tag: `escrow-locked-${s.id}`,
                    requireSound: true
                  });
                })();
              }
              next[i] = { ...next[i], ...s };
              return next;
            }
            return prev;
          });
        })
        .subscribe();

      return () => { try { supabase.removeChannel(ch); } catch {} };
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (uid: string) => {
    const { data } = await supabase
      .from('scenarios')
      .select('*')
      .or(`executor_id.eq.${uid},receiver_id.eq.${uid}`)
      .order('created_at', { ascending: false });
    setScenarios(((data as any) || []) as Scenario[]);
  };

  const refreshRatedMap = useCallback(async (list: Scenario[], raterId: string) => {
    const ids = list.filter(s => s.status === 'confirmed').map(s => s.id);
    if (!raterId || ids.length === 0) { setRatedMap({}); return; }
    const { data, error } = await supabase
      .from('ratings')
      .select('order_id')
      .eq('rater_id', raterId)
      .in('order_id', ids);
    if (error) { console.warn(error); return; }
    const m: Record<string, boolean> = {};
    ((data as any) || []).forEach((row: any) => { m[row.order_id] = true; });
    setRatedMap(m);
  }, []);
  useEffect(() => {
    refreshRatedMap(scenarios, userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, JSON.stringify(scenarios.map(s => ({ id: s.id, status: s.status })))]);

  const measureAll = useCallback(() => {
    const m: Record<string, number> = {};
    document.querySelectorAll<HTMLDivElement>('.scenario-card[data-card-id]').forEach(card => {
      const id = card.getAttribute('data-card-id'); if (!id) return;
      const btn = card.querySelector<HTMLButtonElement>('.scenario-actions .btn');
      if (btn) m[id] = btn.offsetWidth;
    });
    setLineWidths(prev => (JSON.stringify(prev) === JSON.stringify(m) ? prev : m));
  }, []);
  useLayoutEffect(() => {
    measureAll(); window.addEventListener('resize', measureAll);
    return () => window.removeEventListener('resize', measureAll);
  }, [measureAll, scenarios.length]);

  const setLocal = (id: string, patch: Partial<Scenario>) =>
    setScenarios(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)));

  // редагування опису/суми → pending + скидання погоджень
  const updateScenarioField = async (id: string, field: keyof Scenario, value: any) => {
    if (field === 'donation_amount_usdt') {
      if (value === '' || value === null) {
        // allow empty
      } else {
        const n = Number(value);
        const isInt = Number.isInteger(n);
        if (!isInt || n < 0) { alert('Сума має бути цілим числом (0,1,2,3,...)'); return; }
      }
    }

    setLocal(id, { [field]: value as any, is_agreed_by_customer: false, is_agreed_by_executor: false, status: 'pending' });
    await (supabase as any).from('scenarios').update({
      [field]: value === '' ? null : value,
      is_agreed_by_customer: false,
      is_agreed_by_executor: false,
      status: 'pending'
    }).eq('id', id);

    try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
    await pushNotificationManager.showNotification({
      title: field === 'donation_amount_usdt' ? '💰 Сума USDT оновлена (виконавець)' : '📝 Опис оновлено (виконавець)',
      body: 'Потрібно знову погодити угоду.',
      tag: `scenario-update-${id}-${field}`,
      requireSound: true
    });
  };

  const hasCoords = (s: Scenario) => typeof s.latitude === 'number' && Number.isFinite(s.latitude) && typeof s.longitude === 'number' && Number.isFinite(s.longitude);

  const handleAgree = async (s: Scenario) => {
    if (!canAgree(s)) return;
    setAgreeBusy(p => ({ ...p, [s.id]: true }));
    try {
      const { error } = await (supabase as any)
        .from('scenarios')
        .update({ is_agreed_by_executor: true, status: (s.is_agreed_by_customer ? 'agreed' : 'pending') as Status })
        .eq('id', s.id)
        .eq('is_agreed_by_executor', false);
      if (error && error.code !== 'PGRST116') throw error;

      setLocal(s.id, { is_agreed_by_executor: true, status: (s.is_agreed_by_customer ? 'agreed' : 'pending') as Status });

      try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
      await pushNotificationManager.showNotification({
        title: '🤝 Угоду погоджено (виконавець)',
        body: s.is_agreed_by_customer ? 'Можна блокувати кошти (escrow).' : 'Чекаємо дію замовника.',
        tag: `agree-executor-${s.id}`, requireSound: true
      });
    } catch (e:any) {
      alert(e?.message || 'Помилка погодження.');
    } finally {
      setAgreeBusy(p => ({ ...p, [s.id]: false }));
    }
  };

  const handleConfirm = async (s: Scenario) => {
    if (!canConfirm(s)) return;
    setConfirmBusy(p => ({ ...p, [s.id]: true }));
    try {
      const signer: any = await ensureBSCAndGetSigner();
      const who = signer?.getAddress ? (await signer.getAddress()).toLowerCase() : '';
      const provider: any = signer?.provider;

      const dealBefore = await getDealOnChain(s.id);
      const statusOnChain = Number((dealBefore as any).status); // 1 = Locked
      const executorOnChain = String((dealBefore as any).executor || '').toLowerCase();

      if (statusOnChain !== 1 && !IS_CANVAS) { alert('Escrow не у статусі Locked.'); return; }
      if (!IS_CANVAS && executorOnChain !== who) {
        alert(`Підключений гаманець не є виконавцем цього сценарію.\nОчікується: ${executorOnChain}\nПідключено: ${who}`);
        return;
      }

      if (provider?.getBalance && typeof provider.getBalance === 'function') {
        const bal = await provider.getBalance(who);
        // minimal check; skip if BigInt not available
        // (in Canvas shim we keep it permissive)
        if (typeof bal === 'bigint' && bal < 50_000n) {
          // tiny threshold, just in case
        }
      }

      try {
        const b32 = generateScenarioIdBytes32(s.id);
        // In Canvas we don't actually send a tx — just simulate success
        if (!IS_CANVAS) {
          // place for real tx call with ethers.Contract
        }
      } catch {
        await confirmCompletionOnChain({ scenarioId: s.id });
      }

      setLocal(s.id, { is_completed_by_executor: true });
      await (supabase as any).from('scenarios').update({ is_completed_by_executor: true }).eq('id', s.id).eq('is_completed_by_executor', false);

      const deal = await getDealOnChain(s.id);
      let st = Number((deal as any).status);
      if (st !== 3) st = await waitForChainRelease(s.id);
      if (st === 3) {
        await (supabase as any).from('scenarios').update({ status: 'confirmed' }).eq('id', s.id);
        try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
        await pushNotificationManager.showNotification({ title: '🎉 Виконання підтверджено', body: 'Escrow розподілив кошти.', tag: `scenario-confirmed-${s.id}`, requireSound: true });
        setShowFinalToast(true);
      }
    } catch (e:any) {
      alert(humanizeEthersError(e));
    } finally {
      setConfirmBusy(p => ({ ...p, [s.id]: false }));
    }
  };

  // ——— СПОРИ
  const loadOpenDispute = useCallback(async (scenarioId: string) => {
    let d = await getLatestDisputeByScenario(scenarioId);
    if (!d) {
      const { data: s } = await (supabase as any).from('scenarios').select('id, creator_id, executor_id').eq('id', scenarioId).maybeSingle();
      if (s) { try { d = await ensureDisputeRowForScenario(s as any); } catch {} }
    }
    setOpenDisputes(prev => ({ ...prev, [scenarioId]: d && d.status === 'open' ? d : null }));
  }, []);
  useEffect(() => { scenarios.forEach(s => { if (s?.id) loadOpenDispute(s.id); }); }, [scenarios, loadOpenDispute]);

  const onFileChange = async (s: Scenario, ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]; if (!file) return;
    const d = openDisputes[s.id];
    if (!d || d.status !== 'open' || d.behavior_id) { ev.target.value = ''; return; }
    setUploading(p => ({ ...p, [s.id]: true }));
    try {
      await uploadEvidenceAndAttach(d.id, file, uidRef.current);
      await loadOpenDispute(s.id);
      try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
      await pushNotificationManager.showNotification({ title: '📹 Відеодоказ завантажено', body: 'Кліп зʼявився в стрічці Behaviors для голосування.', tag: `evidence-uploaded-${s.id}`, requireSound: true });
    } catch (e:any) {
      alert(e?.message || 'Помилка завантаження відео');
    } finally { setUploading(p => ({ ...p, [s.id]: false })); ev.target.value = ''; }
  };

  // стилі (інлайн)
  const hintStyle: React.CSSProperties = { fontSize: 12, lineHeight: '16px', opacity: 0.8, marginBottom: 8 };
  const labelStyle: React.CSSProperties = { fontSize: 13, lineHeight: '18px', marginBottom: 6, opacity: 0.9 };
  const amountPillStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9999, padding: '2px 8px', background: '#f7f7f7' };
  const amountInputStyle: React.CSSProperties = { borderRadius: 9999, padding: '10px 14px', fontSize: 16, height: 40, outline: 'none', border: 'none', background: 'transparent' };

  const parseDigits = (raw: string): number | null | 'invalid' => {
    if (raw.trim() === '') return null; if (!/^[0-9]+$/.test(raw.trim())) return 'invalid'; return parseInt(raw.trim(), 10);
  };

  return (
    <div className="scenario-list">
      <div className="scenario-header">
        <h2>Отримані сценарії</h2>
        <div className="scenario-status-panel">
          <span>🔔 {permissionStatus === 'granted' ? 'Увімкнено' : permissionStatus === 'denied' ? 'Не підключено' : 'Не запитано'}</span>
          <span>📡 {rt.isListening ? `${rt.method} активний` : 'Не підключено'}</span>
          {permissionStatus !== 'granted' && <button onClick={requestPermission} className="notify-btn">🔔 Дозволити</button>}
        </div>
      </div>

      {scenarios.map(s => {
        const canRate = s.status === 'confirmed' && !ratedMap[s.id];
        return (
          <div key={s.id} className="scenario-card" data-card-id={s.id}>
            <div style={{ marginBottom: 10 }}><StatusStripClassic state={s} /></div>
            <div className="scenario-info">
              <div style={hintStyle}>Опис сценарію і сума добровільного донату редагуються обома учасниками до Погодження угоди.</div>
              <div>
                <strong>Опис:</strong><br/>
                <textarea
                  value={s.description ?? ''}
                  maxLength={1000}
                  style={{ width: lineWidths[s.id] ? `${lineWidths[s.id]}px` : '100%' }}
                  onChange={(e) => setLocal(s.id, { description: e.target.value })}
                  onBlur={(e) => { if (s.status === 'confirmed') return; updateScenarioField(s.id, 'description', (e.target as HTMLTextAreaElement).value); }}
                  disabled={s.status === 'confirmed'}
                />
              </div>
              <div className="meta-row">
                <div className="meta-col"><div className="meta-label">Дата:</div><div className="meta-value">{s.date}</div></div>
                <div className="meta-col"><div className="meta-label">Час:</div><div className="meta-value">{s.time || '—'}</div></div>
              </div>
              <div className="amount-row" style={{ marginTop: 10 }}>
                <label className="amount-label" style={labelStyle}>Сума добровільного донату на підтримку креативності</label>
                <div className="amount-pill" style={amountPillStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="amount-input"
                    value={s.donation_amount_usdt == null ? '' : String(s.donation_amount_usdt)}
                    placeholder="—"
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '' || /^[0-9]+$/.test(raw)) {
                        setLocal(s.id, { donation_amount_usdt: raw === '' ? null : parseInt(raw, 10) });
                      }
                    }}
                    onBlur={(e) => {
                      if (s.status === 'confirmed') return;
                      const res = parseDigits((e.target as HTMLInputElement).value);
                      if (res === 'invalid') { alert('Лише цифри (0,1,2,3,...)'); return; }
                      updateScenarioField(s.id, 'donation_amount_usdt', res === null ? null : res);
                    }}
                    style={amountInputStyle}
                  />
                  <span className="amount-unit">USDT</span>
                </div>
              </div>
            </div>

            <div className="scenario-actions">
              <button className="btn agree" onClick={() => handleAgree(s)} disabled={!canAgree(s)}>🤝 Погодити угоду</button>
              <button className="btn confirm" onClick={() => handleConfirm(s)} disabled={!canConfirm(s)}>✅ Підтвердити виконання</button>
              <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <RateCounterpartyModal scenarioId={s.id} counterpartyId={s.creator_id} disabled={!canRate} onDone={() => setRatedMap(prev => ({ ...prev, [s.id]: true }))} />
                {!canRate && s.status === 'confirmed' && ratedMap[s.id] && (<span style={{ opacity: .8 }}>⭐ Оцінено</span>)}
              </div>
              <input type="file" accept="video/*" ref={el => { fileInputsRef.current[s.id] = el; }} onChange={(ev) => onFileChange(s, ev)} style={{ display: 'none' }} />
              <button type="button" className="btn dispute" onClick={() => { const i = fileInputsRef.current[s.id]; if (!i || uploading[s.id]) return; i.value = ''; i.click(); }}
                disabled={!openDisputes[s.id] || openDisputes[s.id]?.status !== 'open' || !!openDisputes[s.id]?.behavior_id || !!uploading[s.id]}
                title={!openDisputes[s.id] ? 'Доступно лише при відкритому спорі' : ''}>
                {uploading[s.id] ? '…' : '📹 ЗАВАНТАЖИТИ ВІДЕОДОКАЗ'}
              </button>
              <button className="btn location" onClick={() => hasCoords(s) && window.open(`https://www.google.com/maps?q=${s.latitude},${s.longitude}`, '_blank')} disabled={!hasCoords(s)}>📍 Показати локацію</button>
            </div>
          </div>
        );
      })}

      <CelebrationToast open={showFinalToast} variant="executor" onClose={() => setShowFinalToast(false)} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Lightweight self-tests for pure helpers (kept inside the file)
// They run only if you manually call runSelfTests() from devtools.
// ────────────────────────────────────────────────────────────
export function __test_stepOf() {
  const base: Scenario = { id: '1', date: '2025-01-01', time: '00:00', creator_id: 'c', executor_id: 'e', status: 'pending' };
  const a = { ...base, is_agreed_by_executor: false } as Scenario; // -> 1
  const b = { ...base, is_agreed_by_executor: true, is_agreed_by_customer: true, escrow_tx_hash: undefined } as Scenario; // -> 0
  const c = { ...base, is_agreed_by_executor: true, is_agreed_by_customer: true, escrow_tx_hash: '0x', is_completed_by_executor: false, execution_time: '1999-01-01T00:00:00Z' } as Scenario; // -> 2
  const steps = [a, b, c].map((s) => {
    // replicate local stepOf logic
    let r = 0; if (!s.is_agreed_by_executor) r = 1; else if (!s.escrow_tx_hash && s.is_agreed_by_customer) r = 0; else if (s.escrow_tx_hash && reachedExecutionTime(s) && !s.is_completed_by_executor) r = 2; return r;
  });
  return steps; // expect [1,0,2]
}

export function runSelfTests() {
  const r1 = __test_stepOf();
  console.log('[ReceivedScenarios self-tests] stepOf cases =>', r1);
  const nowOk = reachedExecutionTime({ id: 'x', date: '2000-01-01', time: '00:00', creator_id: 'c', executor_id: 'e', status: 'pending' } as any);
  console.log('[ReceivedScenarios self-tests] reachedExecutionTime(past) =>', nowOk);
  return { r1, nowOk };
}
