/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

import { getDealOnChain, confirmCompletionOnChain, lockFunds } from '../lib/escrowContract';
import { pushNotificationManager as pushNotificationManager, useNotifications } from '../lib/pushNotifications';
import { useRealtimeNotifications } from '../lib/realtimeNotifications';
import CelebrationToast from './CelebrationToast';
import './MyOrders.css';

import type { DisputeRow } from '../lib/tables';
import { initiateDispute, getLatestDisputeByScenario } from '../lib/disputeApi';

import ScenarioCard, { Scenario, Status } from './ScenarioCard';
import RateModal from './RateModal';

import { connectWallet, ensureBSC, type Eip1193Provider } from '../lib/wallet';

// Якщо раніше був автоконект тут — видаляємо/коментуємо, щоб НЕ відкривати MetaMask на монтуванні.
// ❌ useEffect(() => { quickOneClickSetup(); }, []);

const SOUND = new Audio('/notification.wav');
SOUND.volume = 0.8;

export default function MyOrders(): JSX.Element {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ==== Завантаження сценаріїв (залишаю загальний приклад; підключіть свою вибірку) ====
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from<Scenario>('scenarios') // таблиця може у вас називатись інакше
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!alive) return;
      if (error) {
        console.error(error);
        setError(error.message);
      } else if (data) {
        setScenarios(data as unknown as Scenario[]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ==== Нотифікації/Realtime (залишив виклики-стаби, щоб не ламати логіку) ====
  useNotifications();
  useRealtimeNotifications();

  // ==== КНОПКА: Забронювати ескроу кошти ====
  const handleReserveEscrow = useCallback(
    async (scenario: Scenario) => {
      setError(null);
      setBusy(true);
      try {
        // 1) Підключення гаманця — саме тут відкриється MetaMask
        const provider: Eip1193Provider = await connectWallet();

        // 2) Перевірка/перемикання мережі (BSC або ваша)
        await ensureBSC(provider);

        // 3) Approve (якщо потрібно) + Lock
        await lockFunds(provider, {
          scenarioId: scenario.id,
          usdtAmount: scenario.amount,               // 👈 підставте актуальну назву поля (сума)
          recipient: (scenario as any).executor_wallet || (scenario as any).executorWallet, // 👈 гаманець виконавця
        });

        // 4) (опціонально) оновити стан угоди/список
        // const chain = await getDealOnChain(provider, scenario.id);
        // await refreshFromSupabaseOrOnchain();

        // 5) Позитивний фідбек:
        try { SOUND.currentTime = 0; SOUND.play().catch(() => undefined); } catch {}
        pushNotificationManager?.show?.('Кошти заброньовано в ескроу ✅');
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? 'Помилка під час бронювання коштів');
      } finally {
        setBusy(false);
      }
    },
    []
  );

  // ==== Підтвердження виконання (існуюча логіка лишається) ====
  const handleConfirmDone = useCallback(
    async (scenario: Scenario) => {
      setError(null);
      setBusy(true);
      try {
        const provider: Eip1193Provider = await connectWallet();
        await ensureBSC(provider);
        await confirmCompletionOnChain(provider, { scenarioId: scenario.id });
        pushNotificationManager?.show?.('Виконання підтверджено ✅');
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? 'Не вдалось підтвердити виконання');
      } finally {
        setBusy(false);
      }
    },
    []
  );

  // ==== Диспут (залишено як було; викличте за вашим UI) ====
  const handleDispute = useCallback(
    async (scenario: Scenario) => {
      setError(null);
      setBusy(true);
      try {
        const row: DisputeRow = await initiateDispute(scenario.id);
        pushNotificationManager?.show?.('Створено диспут 📝');
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? 'Не вдалось створити диспут');
      } finally {
        setBusy(false);
      }
    },
    []
  );

  return (
    <div className="my-orders">
      <header className="bmb-header">
        <h1>Мої замовлення</h1>
        <div className="bmb-sub">🔔 Увімкнено · 🛰 realtime активний</div>
      </header>

      {error && <div className="bmb-error">{error}</div>}
      {isBusy && <div className="bmb-busy">Проводимо транзакцію…</div>}

      <div className="bmb-list">
        {scenarios.map((scn) => (
          <ScenarioCard
            key={scn.id}
            scenario={scn}
            onReserve={() => handleReserveEscrow(scn)}        // ⬅️ ТУТ відкривається MetaMask
            onConfirmDone={() => handleConfirmDone(scn)}
            onDispute={() => handleDispute(scn)}
          />
        ))}
      </div>

      <CelebrationToast />
    </div>
  );
}
