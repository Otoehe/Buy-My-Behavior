import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  confirmCompletion as confirmCompletionOnChain,
  getDealOnChain,
  ESCROW_ADDRESS,
  generateScenarioIdBytes32,
} from '../lib/escrowContract';
import { getSigner, ensureBSC } from '../lib/web3';
import { ethers } from 'ethers';
import { pushNotificationManager, useNotifications } from '../lib/pushNotifications';
import { useRealtimeNotifications } from '../lib/realtimeNotifications';
import CelebrationToast from './CelebrationToast';
import { StatusStripClassic } from './StatusStripClassic';
import RateCounterpartyModal from './RateCounterpartyModal';
import './MyOrders.css';

import type { DisputeRow } from '../lib/tables';
import {
  getLatestDisputeByScenario,
  uploadEvidenceAndAttach,
  ensureDisputeRowForScenario,
} from '../lib/disputeApi';

export type Status = 'pending' | 'agreed' | 'confirmed' | 'disputed' | string;
export interface Scenario {
  id: string;
  description?: string | null;
  date: string;
  time?: string | null;
  execution_time?: string | null;
  creator_id: string;
  executor_id: string;
  receiver_id?: string;
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

const SOUND = new Audio('/notification.wav');
SOUND.volume = 0.8;

async function ensureBSCAndGetSigner() {
  await ensureBSC();
  return await getSigner();
}
function humanizeEthersError(err: any): string {
  const m = String(err?.shortMessage || err?.reason || err?.error?.message || err?.message || '');
  if (!m) return 'Невідома помилка';
  return m.replace(/execution reverted:?/i, '').replace(/\(reason=.*?\)/i, '').trim();
}
async function waitForChainRelease(sid: string, tries = 6, delayMs = 1200) {
  for (let i = 0; i < tries; i++) {
    try {
      const deal = await getDealOnChain(sid);
      const st = Number((deal as any).status);
      if (st === 3 || st === 4) return st;
    } catch {}
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

  useLayoutEffect(() => {
    const styleId = 'bmb-rate-button-patch';
    if (!document.getElementById(styleId)) {
      const el = document.createElement('style');
      el.id = styleId;
      el.textContent = `
        .scenario-actions .rate-wrap button{
          width:100%;
          padding:14px 18px;
          border:none;
          border-radius:999px;
          font-weight:700;
          background: var(--bmb-pink, #ffcdd6);
          color:#000;
          cursor:pointer;
          transition: transform .05s ease, background-color .2s ease, box-shadow .15s ease;
          box-shadow: 0 2px 0 rgba(0,0,0,.05);
        }
        .scenario-actions .rate-wrap button:hover{ background: var(--bmb-pink-hover, #ffb7c8); }
        .scenario-actions .rate-wrap button:active{ transform: translateY(1px); box-shadow: 0 1px 0 rgba(0,0,0,.05); }
        .scenario-actions .rate-wrap button:disabled{ opacity:.5; cursor:not-allowed; }
      `;
      document.head.appendChild(el);
    }
  }, []);

  function stepOf(s: Scenario) {
    if (!s.is_agreed_by_executor) return 1; // погодити
    if (!s.escrow_tx_hash && s.is_agreed_by_customer) return 0; // чекаємо lock
    if (s.escrow_tx_hash && reachedExecutionTime(s) && !s.is_completed_by_executor) return 2; // підтвердити
    return 0;
  }
  const canAgree = (s: Scenario) => stepOf(s) === 1 && !agreeBusy[s.id];
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
  }, [userId, refreshRatedMap, scenarios]);

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

  const hasCoords = (s: Scenario) =>
    typeof s.latitude === 'number' && Number.isFinite(s.latitude) &&
    typeof s.longitude === 'number' && Number.isFinite(s.longitude);

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
      const signer = await ensureBSCAndGetSigner();
      const who = (await signer.getAddress()).toLowerCase();
      const provider = signer.provider as ethers.providers.Web3Provider;

      const dealBefore = await getDealOnChain(s.id);
      const statusOnChain = Number((dealBefore as any).status); // MUST be 2 (Locked)
      const executorOnChain = String((dealBefore as any).executor || '').toLowerCase();

      if (statusOnChain !== 2) { alert('Escrow не у статусі Locked.'); return; }
      if (executorOnChain !== who) {
        alert(`Підключений гаманець не є виконавцем цього сценарію.\nОчікується: ${executorOnChain}\nПідключено: ${who}`);
        return;
      }

      const bal = await provider.getBalance(who);
      if (bal.lt(ethers.utils.parseUnits('0.00005', 'ether'))) { alert('Недостатньо нативної монети для комісії.'); return; }

      try {
        const b32 = generateScenarioIdBytes32(s.id);
        const abi = ['function confirmCompletion(bytes32)'];
        const c = new ethers.Contract(ESCROW_ADDRESS, abi, signer);
        await c.callStatic.confirmCompletion(b32);
        let gas; try { gas = await c.estimateGas.confirmCompletion(b32); } catch { gas = ethers.BigNumber.from(150000); }
        const tx = await c.confirmCompletion(b32, { gasLimit: gas.mul(12).div(10) });
        await tx.wait();
      } catch {
        await confirmCompletionOnChain({ scenarioId: s.id });
      }

      setLocal(s.id, { is_completed_by_executor: true });
      await (supabase as any)
        .from('scenarios')
        .update({ is_completed_by_executor: true })
        .eq('id', s.id)
        .eq('is_completed_by_executor', false);

      const deal = await getDealOnChain(s.id);
      let st = Number((deal as any).status);
      if (st !== 3) st = await waitForChainRelease(s.id);
      if (st === 3) {
        await (supabase as any).from('scenarios').update({ status: 'confirmed' }).eq('id', s.id);
        try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
        await pushNotificationManager.showNotification({
          title: '🎉 Виконання підтверджено',
          body: 'Escrow розподілив кошти.',
          tag: `scenario-confirmed-${s.id}`,
          requireSound: true
        });
        setShowFinalToast(true);
      }
    } catch (e:any) {
      alert(humanizeEthersError(e));
    } finally {
      setConfirmBusy(p => ({ ...p, [s.id]: false }));
    }
  };

  const loadOpenDispute = useCallback(async (scenarioId: string) => {
    let d = await getLatestDisputeByScenario(scenarioId);
    if (!d || d.status !== 'open') {
      const { data: s } = await (supabase as any)
        .from('scenarios')
        .select('id, creator_id, executor_id')
        .eq('id', scenarioId)
        .maybeSingle();
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
      await pushNotificationManager.showNotification({
        title: '📹 Відеодоказ завантажено',
        body: 'Кліп зʼявився в стрічці Behaviors для голосування.',
        tag: `evidence-uploaded-${s.id}`,
        requireSound: true
      });
    } catch (e:any) {
      alert(e?.message || 'Помилка завантаження відео');
    } finally { setUploading(p => ({ ...p, [s.id]: false })); ev.target.value = ''; }
  };

  const hintStyle: React.CSSProperties  = { fontSize: 12, lineHeight: '16px', opacity: 0.8, marginBottom: 8 };
  const labelStyle: React.CSSProperties = { fontSize: 13, lineHeight: '18px', marginBottom: 6, opacity: 0.9 };

  const pillRowStyle: React.CSSProperties = { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' };
  const amountPill: React.CSSProperties  = { display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9999, padding: '2px 8px', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,.06)' };
  const amountInput: React.CSSProperties = { borderRadius: 9999, padding: '10px 14px', fontSize: 16, height: 40, outline: 'none', border: '1px solid rgba(0,0,0,.06)', background: '#fff', textAlign: 'center', minWidth: 92 };
  const amountUnit:  React.CSSProperties = { fontWeight: 700 };

  const parseDigits = (raw: string): number | null | 'invalid' => {
    if (raw.trim() === '') return null;
    if (!/^[0-9]+$/.test(raw.trim())) return 'invalid';
    return parseInt(raw.trim(), 10);
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
            <div style={{ marginBottom: 10 }}>
              <StatusStripClassic state={s} />
            </div>

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

              <div className="amount-row" style={pillRowStyle}>
                <label className="amount-label" style={labelStyle}>Сума добровільного донату на підтримку креативності</label>
                <div className="amount-pill" style={amountPill}>
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
                    style={amountInput}
                  />
                  <span className="amount-unit" style={amountUnit}>USDT</span>
                </div>
              </div>
            </div>

            <div className="scenario-actions">
              <button className="btn agree"   onClick={() => handleAgree(s)}  disabled={!canAgree(s)}>🤝 Погодити угоду</button>
              <button className="btn confirm" onClick={() => handleConfirm(s)} disabled={!canConfirm(s)}>✅ Підтвердити виконання</button>

              <div className="rate-wrap" style={{ width: '100%' }}>
                <RateCounterpartyModal
                  scenarioId={s.id}
                  counterpartyId={s.creator_id}
                  disabled={!canRate}
                  onDone={() => setRatedMap(prev => ({ ...prev, [s.id]: true }))}
                />
              </div>
              {!canRate && s.status === 'confirmed' && ratedMap[s.id] && (
                <div className="flags-line">⭐ Оцінено</div>
              )}

              <input
                type="file"
                accept="video/*"
                ref={el => { fileInputsRef.current[s.id] = el; }}
                onChange={(ev) => onFileChange(s, ev)}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn dispute"
                onClick={() => {
                  const i = fileInputsRef.current[s.id];
                  if (!i || uploading[s.id]) return;
                  i.value = '';
                  i.click();
                }}
                disabled={
                  !openDisputes[s.id] ||
                  openDisputes[s.id]?.status !== 'open' ||
                  !!openDisputes[s.id]?.behavior_id ||
                  !!uploading[s.id]
                }
                title={!openDisputes[s.id] ? 'Доступно лише при відкритому спорі' : ''}
              >
                {uploading[s.id] ? '…' : '📹 ЗАВАНТАЖИТИ ВІДЕОДОКАЗ'}
              </button>

              <button
                className="btn location"
                onClick={() => hasCoords(s) && window.open(`https://www.google.com/maps?q=${s.latitude},${s.longitude}`, '_blank')}
                disabled={!hasCoords(s)}
              >📍 Показати локацію</button>
            </div>
          </div>
        );
      })}

      <CelebrationToast open={showFinalToast} variant="executor" onClose={() => setShowFinalToast(false)} />
    </div>
  );
}
