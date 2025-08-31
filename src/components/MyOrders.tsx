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

// ⬇️ додано: класичний степер
import { StatusStripClassic } from './StatusStripClassic';

const SOUND = new Audio('/notification.wav');
SOUND.volume = 0.8;

// … (усі ваші хелпери без змін)

// (файл далі без скорочень)
export default function MyOrders() {
  // ...весь існуючий код зверху без змін...

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
          <div key={s.id} style={{ marginBottom: 12 }}>
            {/* ⬇️ нове: показуємо статус угоди над карткою */}
            <div style={{ marginBottom: 10 }}>
              <StatusStripClassic state={s} />
            </div>

            <ScenarioCard
              role="customer"
              s={s}
              // редагування опису — як було (скидає погодження)
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

              // сума: дозволяємо тільки ціле >= 0 (нуль ок)
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
