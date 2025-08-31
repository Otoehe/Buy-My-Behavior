// 📄 src/components/MyOrders.tsx
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
import { StatusStripClassic } from './StatusStripClassic';

const SOUND = new Audio('/notification.wav');
SOUND.volume = 0.8;

type BusyMap = Record<string, boolean>;
type LocalPatch = Partial<Pick<Scenario, 'description' | 'donation_amount_usdt'>>;

export default function MyOrders() {
  const [list, setList] = useState<Scenario[]>([]);
  const [local, setLocalState] = useState<Record<string, LocalPatch>>({});
  const [agreeBusy, setAgreeBusy] = useState<BusyMap>({});
  const [lockBusy, setLockBusy] = useState<BusyMap>({});
  const [confirmBusy, setConfirmBusy] = useState<BusyMap>({});
  const [toast, setToast] = useState(false);

  // рейтинг
  const [rateOpen, setRateOpen] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);
  const [rateScore, setRateScore] = useState<number>(10);
  const [rateComment, setRateComment] = useState<string>('');
  const [rateScenarioId, setRateScenarioId] = useState<string | null>(null);
  const [ratedOrders, setRatedOrders] = useState<Set<string>>(new Set());

  useNotifications();
  useRealtimeNotifications();

  const setLocal = useCallback((id: string, patch: LocalPatch) => {
    setLocalState(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
    setList(prev => prev.map(s => (s.id === id ? { ...s, ...(patch as any) } : s)));
  }, []);

  const hasCoords = (s: Scenario) =>
    typeof s.latitude === 'number' &&
    typeof s.longitude === 'number' &&
    !Number.isNaN(s.latitude) &&
    !Number.isNaN(s.longitude);

  const stepOf = (s: Scenario) => {
    if (!s.is_agreed_by_customer || !s.is_agreed_by_executor) return 1; // agree
    if (!s.is_locked_onchain) return 2; // lock
    return 3; // confirm
  };

  const canDispute = (s: Scenario) =>
    s.status !== 'disputed' && s.is_locked_onchain && s.status !== 'confirmed';

  // завантаження сценаріїв (ти = creator_id)
  const fetchMyScenarios = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setList([]);

    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) setList(data as any as Scenario[]);
  }, []);

  useEffect(() => {
    fetchMyScenarios();

    const ch = supabase
      .channel('realtime:scenarios-myorders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scenarios' }, (payload) => {
        const row = payload.new as any as Scenario;
        setList(prev => {
          const i = prev.findIndex(x => x.id === row.id);
          if (i === -1) return prev;
          const next = [...prev];
          next[i] = { ...prev[i], ...row };
          return next;
        });
      })
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [fetchMyScenarios]);

  // дії
  const handleAgree = useCallback(async (s: Scenario) => {
    setAgreeBusy(v => ({ ...v, [s.id]: true }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Потрібно увійти');

      const patch: any = { is_agreed_by_customer: true, status: 'pending' };
      if (s.is_agreed_by_executor) patch.status = 'agreed';

      await supabase.from('scenarios').update(patch).eq('id', s.id);

      try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
      await pushNotificationManager.showNotification({
        title: '🤝 Угоду погоджено',
        body: 'Можна переходити до бронювання коштів',
        tag: `scenario-agree-${s.id}`,
        requireSound: true
      });

      await fetchMyScenarios();
    } catch (e: any) {
      alert(e?.message || 'Помилка погодження');
    } finally {
      setAgreeBusy(v => ({ ...v, [s.id]: false }));
    }
  }, [fetchMyScenarios]);

  const handleLock = useCallback(async (s: Scenario) => {
    setLockBusy(v => ({ ...v, [s.id]: true }));
    try {
      if (!Number.isFinite(s.donation_amount_usdt as any)) {
        throw new Error('Сума USDT не задана');
      }
      const signer = await getSigner();
      const tx = await lockFunds(signer as ethers.Signer, s);
      await tx.wait?.();

      await supabase.from('scenarios').update({
        is_locked_onchain: true,
        status: 'agreed'
      }).eq('id', s.id);

      try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
      await pushNotificationManager.showNotification({
        title: '🔒 Кошти заброньовано',
        body: 'Escrow активовано на смартконтракті',
        tag: `scenario-lock-${s.id}`,
        requireSound: true
      });

      await fetchMyScenarios();
    } catch (e: any) {
      alert(e?.message || 'Помилка бронювання коштів');
    } finally {
      setLockBusy(v => ({ ...v, [s.id]: false }));
    }
  }, [fetchMyScenarios]);

  const handleConfirm = useCallback(async (s: Scenario) => {
    setConfirmBusy(v => ({ ...v, [s.id]: true }));
    try {
      const signer = await getSigner();
      const tx = await confirmCompletionOnChain(signer as ethers.Signer, s);
      await tx.wait?.();

      await supabase.from('scenarios').update({ status: 'confirmed' }).eq('id', s.id);

      setToast(true);
      await fetchMyScenarios();
    } catch (e: any) {
      alert(e?.message || 'Помилка підтвердження');
    } finally {
      setConfirmBusy(v => ({ ...v, [s.id]: false }));
    }
  }, [fetchMyScenarios]);

  const handleDispute = useCallback(async (s: Scenario) => {
    try {
      await initiateDispute(s.id);
      await supabase.from('scenarios').update({ status: 'disputed' }).eq('id', s.id);
      await fetchMyScenarios();
      await pushNotificationManager.showNotification({
        title: '⚠️ Відкрито диспут',
        body: 'Додайте відеодоказ та стежте за голосуванням',
        tag: `scenario-dispute-${s.id}`,
        requireSound: true
      });
    } catch (e: any) {
      alert(e?.message || 'Не вдалося створити диспут');
    }
  }, [fetchMyScenarios]);

  // рейтинг
  const openRateFor = (s: Scenario) => {
    setRateScenarioId(s.id);
    setRateScore(10);
    setRateComment('');
    setRateOpen(true);
  };

  const saveRating = async () => {
    if (!rateScenarioId) return;
    setRateBusy(true);
    try {
      await upsertRating({ scenario_id: rateScenarioId, score: rateScore, comment: rateComment, role: 'customer' });
      setRatedOrders(prev => new Set([...prev, rateScenarioId]));
      setRateOpen(false);
    } catch (e: any) {
      alert(e?.message || 'Не вдалося зберегти оцінку');
    } finally {
      setRateBusy(false);
    }
  };

  return (
    <div className="scenario-list">
      <div className="scenario-header">
        <h2>Мої замовлення</h2>
      </div>

      {list.length === 0 && <div className="empty-hint">Немає активних замовлень.</div>}

      {list.map(s => {
        const step = stepOf(s);
        const onlyAgree   = step === 1;
        const onlyLock    = step === 2;
        const onlyConfirm = step === 3;

        return (
          <div key={s.id} style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 10 }}>
              <StatusStripClassic state={s} />
            </div>

            <ScenarioCard
              role="customer"
              s={s}
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
                if (v !== null) {
                  const isInt = Number.isInteger(v);
                  if (!isInt || v < 0) {
                    alert('Сума має бути цілим числом (0,1,2,3,...)');
                    setLocal(s.id, { donation_amount_usdt: null });
                    return;
                  }
                }
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

              canAgree={onlyAgree && !agreeBusy[s.id]}
              canLock={onlyLock && !lockBusy[s.id]}
              canConfirm={onlyConfirm && !confirmBusy[s.id]}
              canDispute={canDispute(s)}

              hasCoords={hasCoords(s)}
              busyAgree={!!agreeBusy[s.id]}
              busyLock={!!lockBusy[s.id]}
              busyConfirm={!!confirmBusy[s.id]}

              hideLock={!onlyLock}
              hideConfirm={!onlyConfirm}
              hideDispute={!canDispute(s)}

              isRated={s.status === 'confirmed' && ratedOrders.has(s.id)}
              onOpenRate={() => s.status === 'confirmed' && !ratedOrders.has(s.id) && openRateFor(s)}
            />
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
