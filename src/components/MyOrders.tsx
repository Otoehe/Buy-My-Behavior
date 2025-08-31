import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  lockFunds,
  confirmCompletionOnChain,
  getDealOnChain,
} from '../lib/escrowContract';
import { getSigner } from '../lib/web3';
import { ethers } from 'ethers';
import { pushNotificationManager, useNotifications } from '../lib/pushNotifications';
import { useRealtimeNotifications } from '../lib/realtimeNotifications';
import CelebrationToast from './CelebrationToast';
import './MyOrders.css';

import type { DisputeRow } from '../lib/tables';
import { initiateDispute, getLatestDisputeByScenario } from '../lib/disputeApi';

import ScenarioCard, { Scenario, Status } from './ScenarioCard';
import RateModal from './RateModal';
import { upsertRating } from '../lib/ratings';

const SOUND = new Audio('/notification.wav');
SOUND.volume = 0.8;

// ⬇️ Гарантуємо MetaMask + мережу BSC
async function ensureBSCAndGetSigner() {
  let signer = await getSigner();
  const provider = signer.provider as ethers.providers.Web3Provider;
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 56 && (window as any).ethereum?.request) {
    await (window as any).ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x38' }],
    });
    signer = await getSigner();
  }
  return signer;
}

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

// ⬇️ допоміжне: чи настав час виконання
function reachedExecutionTime(s: Scenario) {
  const dt = s.execution_time ? new Date(s.execution_time) : new Date(`${s.date}T${s.time || '00:00'}`);
  return !Number.isNaN(dt.getTime()) && new Date() >= dt;
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

  // rating modal state
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

  // ---- КРОКИ (step gating) ----
  function stepOf(s: Scenario) {
    // 1) Погодити угоду (доступно обом, поки не взаємно погоджено)
    if (!(s.is_agreed_by_customer && s.is_agreed_by_executor)) return 1;
    // 2) Після взаємного погодження — тільки Замовник блокує кошти
    if (!s.escrow_tx_hash) return 2;
    // 3) Після escrow — чекаємо настання часу виконання
    if (reachedExecutionTime(s)) return 3; // Підтвердити/Оспорити виконання (для Клієнта), підтвердити — для обох
    return 0; // очікуємо часу
  }
  const canAgree = (s: Scenario)   => stepOf(s) === 1;
  const canLock = (s: Scenario)    => stepOf(s) === 2;
  const canConfirm = (s: Scenario) => stepOf(s) === 3;

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

              // Пуш при фінальному підтвердженні
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

  // ------- actions -------
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

      // Локальний пуш-підтвердження кроку
      try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
      await pushNotificationManager.showNotification({
        title: '🤝 Ви погодили угоду',
        body: s.is_agreed_by_executor ? 'Доступно: Забронювати кошти' : 'Чекаємо погодження виконавця',
        tag: `agree-customer-${s.id}`,
        requireSound: true
      });
    } catch (e:any) {
      alert(e?.message || 'Помилка погодження.');
    } finally {
      setAgreeBusy(p => ({ ...p, [s.id]: false }));
    }
  };

  const handleLock = async (s: Scenario) => {
    if (lockBusy[s.id]) return;
    if (!canLock(s)) return;
    if (!s.donation_amount_usdt || s.donation_amount_usdt <= 0) { alert('Сума має бути > 0'); return; }
    if (s.escrow_tx_hash) return;

    setLockBusy(p => ({ ...p, [s.id]: true }));
    try {
      const signer = await ensureBSCAndGetSigner();
      const tx = await lockFunds({ amount: Number(s.donation_amount_usdt), scenarioId: s.id, signer });
      await supabase.from('scenarios').update({ escrow_tx_hash: tx?.hash || 'locked', status: 'agreed' }).eq('id', s.id);
      setLocal(s.id, { escrow_tx_hash: (tx?.hash || 'locked') as any, status: 'agreed' });

      try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
      await pushNotificationManager.showNotification({
        title: '💳 Кошти заброньовано',
        body: 'Escrow активовано. Очікуємо час виконання.',
        tag: `escrow-locked-${s.id}`,
        requireSound: true
      });
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

  // ⬇️ Оспорити виконання (доступно Клієнту після escrow і настання часу, без відкритого спору)
  const canDispute = (s: Scenario) => {
    const notFinal = s.status !== 'confirmed';
    const escrowLocked = !!s.escrow_tx_hash;
    const noOpenDispute = !openDisputes[s.id];
    const iAmCustomer = userId === s.creator_id;
    const timeReached = reachedExecutionTime(s);
    return notFinal && escrowLocked && noOpenDispute && iAmCustomer && timeReached;
  };

  const handleDispute = async (s: Scenario) => {
    try {
      const d = await initiateDispute({ id: s.id, creator_id: s.creator_id, executor_id: s.executor_id });
      setLocal(s.id, { status: 'disputed' } as any);
      setOpenDisputes(prev => ({ ...prev, [s.id]: d }));

      try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
      await pushNotificationManager.showNotification({
        title: '⚖️ Спір відкрито',
        body: 'Виконавцю доступне завантаження відеодоказу.',
        tag: `dispute-opened-${s.id}`,
        requireSound: true
      });
    } catch (e:any) {
      alert(e?.message || 'Не вдалося створити спір');
    }
  };

  // rating (customer → rates executor)
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
        const step = stepOf(s);
        const onlyAgree   = step === 1;
        const onlyLock    = step === 2;
        const onlyConfirm = step === 3;

        return (
          <ScenarioCard
            key={s.id}
            role="customer"
            s={s}

            // ⬇️ Редагування опису/суми для Замовника — активне до фінального підтвердження.
            onChangeDesc={(v) => setLocal(s.id, { description: v })}
            onCommitDesc={async (v) => {
              if (s.status === 'confirmed') return;
              await supabase.from('scenarios').update({
                description: v,
                status: 'pending',
                is_agreed_by_customer: false,
                is_agreed_by_executor: false
              }).eq('id', s.id);

              try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
              await pushNotificationManager.showNotification({
                title: '📝 Опис оновлено (замовник)',
                body: 'Потрібно знову погодити угоду.',
                tag: `scenario-update-${s.id}-desc`,
                requireSound: true
              });
            }}

            onChangeAmount={(v) => setLocal(s.id, { donation_amount_usdt: v })}
            onCommitAmount={async (v) => {
              if (s.status === 'confirmed') return;
              if (v !== null && (!Number.isFinite(v) || v <= 0)) { alert('Сума має бути > 0'); setLocal(s.id, { donation_amount_usdt: null }); return; }
              await supabase.from('scenarios').update({
                donation_amount_usdt: v,
                status: 'pending',
                is_agreed_by_customer: false,
                is_agreed_by_executor: false
              }).eq('id', s.id);

              try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
              await pushNotificationManager.showNotification({
                title: '💰 Сума USDT оновлена (замовник)',
                body: 'Потрібно знову погодити угоду.',
                tag: `scenario-update-${s.id}-amount`,
                requireSound: true
              });
            }}

            onAgree={() => handleAgree(s)}
            onLock={() => handleLock(s)}
            onConfirm={() => handleConfirm(s)}
            onDispute={() => handleDispute(s)}
            onOpenLocation={() => hasCoords(s) && window.open(`https://www.google.com/maps?q=${s.latitude},${s.longitude}`, '_blank')}

            // ⬇️ Строге вмикання по етапах
            canAgree={onlyAgree && !agreeBusy[s.id]}
            canLock={onlyLock && !lockBusy[s.id]}
            canConfirm={onlyConfirm && !confirmBusy[s.id]}
            canDispute={canDispute(s)}

            hasCoords={hasCoords(s)}
            busyAgree={!!agreeBusy[s.id]}
            busyLock={!!lockBusy[s.id]}
            busyConfirm={!!confirmBusy[s.id]}

            // (якщо ScenarioCard підтримує приховування — підкинемо хінти; інакше — ігнорує)
            hideLock={!onlyLock}
            hideConfirm={!onlyConfirm}
            hideDispute={!canDispute(s)}

            isRated={s.status === 'confirmed' && ratedOrders.has(s.id)}
            onOpenRate={() => s.status === 'confirmed' && !ratedOrders.has(s.id) && openRateFor(s)}
          />
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
