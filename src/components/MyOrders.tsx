/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

import {
  confirmCompletionOnChain,
  getDealOnChain,
} from '../lib/escrowContract';

import {
  pushNotificationManager as NotificationManager,
  useNotifications,
} from '../lib/pushNotifications';
import { useRealtimeNotifications } from '../lib/realtimeNotifications';

import CelebrationToast from './CelebrationToast';
import './MyOrders.css';

import type { DisputeRow } from '../lib/tables';
import { initiateDispute, getLatestDisputeByScenario } from '../lib/disputeApi';

import ScenarioCard, { Scenario, Status } from './ScenarioCard';
import RateModal from './RateModal';
import { upsertRating } from '../lib/ratings';

import { connectWallet, ensureBSC, waitForReturn } from '../lib/providerBridge';
import { lockFundsMobileFlow } from '../lib/escrowMobile';

// ---- локальні утиліти -------------------------------------------------------

const SOUND = new Audio('/notification.wav');
SOUND.volume = 0.8;

function toNumberSafe(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function openGMaps(lat?: number | null, lng?: number | null) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return;
  const q = `${lat},${lng}`;
  const url = `https://maps.google.com/?q=${encodeURIComponent(q)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ---- основний компонент -----------------------------------------------------

export default function MyOrders() {
  const location = useLocation();
  void location; // позбавляємось warning, не впливає на логіку

  const { notify } = useNotifications();
  useRealtimeNotifications();

  const [userId, setUserId] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [rateOpen, setRateOpen] = useState<boolean>(false);
  const [rateScenarioId, setRateScenarioId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [celebrate, setCelebrate] = useState<boolean>(false);

  // — Ініціалізація користувача
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid || null);
    })();
  }, []);

  // — Завантаження сценаріїв поточного користувача (Замовника)
  const fetchScenarios = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .eq('customer_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetchScenarios error', error);
    } else {
      setScenarios((data || []) as unknown as Scenario[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  // — Realtime підписка по scenarios
  useEffect(() => {
    const channel = supabase
      .channel('realtime:scenarios:my-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scenarios', filter: userId ? `customer_id=eq.${userId}` : undefined },
        () => {
          fetchScenarios();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchScenarios]);

  // — Хендлери ---------------------------------------------------------------

  const handleAgree = useCallback(
    async (s: Scenario) => {
      try {
        const { error } = await supabase
          .from('scenarios')
          .update({ status: 'agreed' as Status })
          .eq('id', s.id);

        if (error) throw error;

        notify('Угоду погоджено ✔');
        SOUND.play().catch(() => {});
      } catch (e) {
        console.error(e);
        notify('Помилка під час погодження угоди');
      }
    },
    [notify]
  );

  const handleLockEntry = useCallback(
    async (s: Scenario) => {
      try {
        setStatusMsg('Підготовка до блокування коштів…');

        // (не обов’язково) ensureBSC для стабільності й адреси
        try {
          const { provider, address } = await connectWallet();
          await ensureBSC(provider);
          setAddress(address);
        } catch {
          // Якщо поза MetaMask → у lockFundsMobileFlow відпрацює deeplink
        }

        const amount = toNumberSafe((s as any).donation_amount_usdt, 0);
        if (!amount || amount <= 0) {
          notify('Сума замовлення не задана');
          return;
        }

        const executor =
          (s as any).executor_wallet ||
          (s as any).executor_address ||
          (s as any).executor;
        if (!executor) {
          notify('Не вказано гаманець виконавця');
          return;
        }

        const referrer = (s as any).referrer_wallet || null;

        // Основний мобільний потік escrow
        const txHash = await lockFundsMobileFlow({
          scenarioId: String(s.id),
          amount,
          executor,
          referrer,
          onStatus: (m) => setStatusMsg(m),
          onHash: (h) => setStatusMsg(`Tx: ${h.slice(0, 10)}…`),
          onReceipt: () => setStatusMsg('Escrow locked ✅'),
          saveTxHash: async (h) => {
            await supabase.from('scenarios').update({ lock_tx_hash: h }).eq('id', s.id);
          },
        });

        // freeze edits / залишаємо статус agreed
        await supabase.from('scenarios').update({ status: 'agreed' as Status }).eq('id', s.id);

        notify('Кошти заблоковано в ескроу');
        SOUND.play().catch(() => {});
        setCelebrate(true);

        await waitForReturn(120000, 700);
      } catch (e: any) {
        if (e?.code === 'DEEPLINKED') {
          setStatusMsg('Відкрито MetaMask. Продовжіть всередині додатку.');
          return;
        }
        console.error('lockFundsMobileFlow error', e);
        notify('Не вдалося заблокувати кошти');
      }
    },
    [notify]
  );

  const handleConfirm = useCallback(
    async (s: Scenario) => {
      try {
        setStatusMsg('Очікуємо підтвердження виконання на ланцюгу…');
        const tx = await confirmCompletionOnChain(String(s.id));
        await tx.wait?.(1);

        await supabase.from('scenarios').update({ status: 'confirmed' as Status }).eq('id', s.id);

        notify('Виконання підтверджено ✅');
        setCelebrate(true);
      } catch (e) {
        console.error(e);
        notify('Помилка під час підтвердження виконання');
      }
    },
    [notify]
  );

  const handleDispute = useCallback(
    async (s: Scenario) => {
      try {
        const existing: DisputeRow | null = await getLatestDisputeByScenario(String(s.id));
        if (existing) {
          notify('Спір уже створено');
          return;
        }
        await initiateDispute(String(s.id));
        await supabase.from('scenarios').update({ status: 'disputed' as Status }).eq('id', s.id);
        notify('Створено спір. Комʼюніті розпочинає голосування.');
      } catch (e) {
        console.error(e);
        notify('Не вдалося створити спір');
      }
    },
    [notify]
  );

  const handleOpenLocation = useCallback((s: Scenario) => {
    const lat = (s as any).lat ?? (s as any).latitude;
    const lng = (s as any).lng ?? (s as any).longitude;
    openGMaps(
      typeof lat === 'string' ? Number(lat) : lat,
      typeof lng === 'string' ? Number(lng) : lng
    );
  }, []);

  const openRate = useCallback((scenarioId: string) => {
    setRateScenarioId(scenarioId);
    setRateOpen(true);
  }, []);

  const closeRate = useCallback(() => {
    setRateOpen(false);
    setRateScenarioId(null);
  }, []);

  const handleRateSubmit = useCallback(
    async (stars: number, comment?: string) => {
      if (!rateScenarioId || !userId) return;
      try {
        await upsertRating({
          scenario_id: rateScenarioId,
          author_id: userId,
          stars,
          comment: comment || '',
        });
        notify('Дякуємо за відгук!');
        closeRate();
      } catch (e) {
        console.error(e);
        notify('Не вдалося зберегти оцінку');
      }
    },
    [rateScenarioId, userId, notify, closeRate]
  );

  const items = useMemo(() => scenarios, [scenarios]);

  // ---- UI -------------------------------------------------------------------

  return (
    <div className="my-orders">
      <header className="my-orders__header">
        <h1>Мої замовлення</h1>
        {statusMsg ? <div className="my-orders__status">{statusMsg}</div> : null}
      </header>

      {loading && <div className="my-orders__loading">Завантаження…</div>}

      {!loading && items.length === 0 && (
        <div className="my-orders__empty">Поки що немає замовлень.</div>
      )}

      <div className="my-orders__list">
        {items.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            onAgree={() => handleAgree(s)}
            onLock={() => handleLockEntry(s)}
            onConfirm={() => handleConfirm(s)}
            onDispute={() => handleDispute(s)}
            onOpenLocation={() => handleOpenLocation(s)}
            // onRate={() => openRate(String(s.id))}
          />
        ))}
      </div>

      <RateModal open={rateOpen} onClose={closeRate} onSubmit={handleRateSubmit} />

      <CelebrationToast open={celebrate} onClose={() => setCelebrate(false)} />
    </div>
  );
}
