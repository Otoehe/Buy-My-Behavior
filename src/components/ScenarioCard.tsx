import React, { useEffect, useRef, useState } from 'react';
import './MyOrders.css';

export type Status = 'pending' | 'agreed' | 'confirmed' | 'disputed' | string;

export interface Scenario {
  id: string;
  description: string | null;
  donation_amount_usdt: number | null;
  date: string | null;
  time: string | null;
  execution_time?: string | null;

  status: Status;
  escrow_tx_hash?: string | null;

  // flags
  is_agreed_by_customer?: boolean;
  is_agreed_by_executor?: boolean;
  is_completed_by_customer?: boolean;
  is_completed_by_executor?: boolean;

  // coords
  latitude?: number | null;
  longitude?: number | null;

  // parties
  creator_id: string;
  executor_id: string;
}

type Props = {
  role: 'customer' | 'executor';
  s: Scenario;

  // live optimistic updates (локально)
  onChangeDesc?: (value: string) => void;
  onChangeAmount?: (value: number | null) => void;

  // commit на blur (оновлення БД)
  onCommitDesc?: (value: string) => Promise<void> | void;
  onCommitAmount?: (value: number | null) => Promise<void> | void;

  // дії
  onAgree?: () => void;
  onLock?: () => void;
  onConfirm?: () => void;
  onDispute?: () => void;
  onOpenLocation?: () => void;
  onOpenRate?: () => void;

  // дозволи
  canAgree?: boolean;
  canLock?: boolean;
  canConfirm?: boolean;
  canDispute?: boolean;
  hasCoords?: boolean;

  // стани
  busyAgree?: boolean;
  busyLock?: boolean;
  busyConfirm?: boolean;

  // рейтинг
  isRated?: boolean;
};

export default function ScenarioCard(props: Props) {
  const {
    s,
    onChangeDesc, onCommitDesc,
    onChangeAmount, onCommitAmount,
    onAgree, onLock, onConfirm, onDispute, onOpenLocation, onOpenRate,
    canAgree, canLock, canConfirm, canDispute, hasCoords,
    busyAgree, busyLock, busyConfirm,
    isRated,
  } = props;

  // ── READONLY: редагувати можна доки escrow не заблоковано і не confirmed
  const readOnly = !!s.escrow_tx_hash || s.status === 'confirmed';

  // ── ДРАФТИ (щоб реалайм не перетрирав під час набору)
  const [descDraft, setDescDraft] = useState<string>(s.description ?? '');
  const [amtDraft, setAmtDraft] = useState<string>(s.donation_amount_usdt != null ? String(s.donation_amount_usdt) : '');
  const editingDesc = useRef(false);
  const editingAmt  = useRef(false);

  // Коли приходить оновлення ззовні — підхоплюємо, тільки якщо НЕ редагуємо зараз
  useEffect(() => {
    if (!editingDesc.current) setDescDraft(s.description ?? '');
  }, [s.description]);

  useEffect(() => {
    if (!editingAmt.current) setAmtDraft(s.donation_amount_usdt != null ? String(s.donation_amount_usdt) : '');
  }, [s.donation_amount_usdt]);

  // ── Коміти на blur
  const commitDesc = async () => {
    const val = descDraft.trim();
    onChangeDesc?.(val);
    await onCommitDesc?.(val);
  };

  const commitAmount = async () => {
    const raw = amtDraft.trim().replace(',', '.');
    if (raw === '') {
      onChangeAmount?.(null);
      await onCommitAmount?.(null);
      return;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      alert('Сума має бути > 0');
      // не комітимо некоректне
      setAmtDraft(s.donation_amount_usdt != null ? String(s.donation_amount_usdt) : '');
      return;
    }
    onChangeAmount?.(num);
    await onCommitAmount?.(num);
  };

  // ── Допоміжне: прогрес (залишаємо як було, якщо використовуєте стилі)
  const stage = (() => {
    let st = 0;
    if (s.id) st = 1;
    if ((s.is_agreed_by_customer && s.is_agreed_by_executor) || s.status === 'agreed') st = 2;
    if (s.escrow_tx_hash) st = 3;
    if (s.is_completed_by_executor) st = 4;
    if (s.is_completed_by_customer) st = 5;
    if (s.status === 'confirmed') st = 6;
    return st;
  })();
  const percent = Math.max(0, Math.min(100, (stage / 6) * 100));

  return (
    <div className="scenario-card" data-card-id={s.id}>
      <div className="scenario-info">
        <div>
          <strong>Опис:</strong><br/>
          <textarea
            value={descDraft}
            maxLength={1000}
            onFocus={() => { editingDesc.current = true; }}
            onBlur={async () => { editingDesc.current = false; await commitDesc(); }}
            onChange={(e) => setDescDraft(e.currentTarget.value)}
            disabled={readOnly}
          />
        </div>

        <div className="meta-row">
          <div className="meta-col">
            <div className="meta-label">Дата:</div>
            <div className="meta-value">{s.date || '—'}</div>
          </div>
          <div className="meta-col">
            <div className="meta-label">Час:</div>
            <div className="meta-value">{s.time || '—'}</div>
          </div>
        </div>

        <div className="amount-row">
          <div className="amount-pill">
            <input
              className="amount-input"
              type="text"
              inputMode="decimal"
              lang="en"
              placeholder="—"
              value={amtDraft}
              onFocus={() => { editingAmt.current = true; }}
              onChange={(e) => setAmtDraft(e.currentTarget.value)}
              onBlur={async () => { editingAmt.current = false; await commitAmount(); }}
              disabled={readOnly}
            />
            <span className="amount-unit">USDT</span>
          </div>
        </div>

        <div className="bmb-progress-wrap" data-stage={stage} aria-label={`Статус: крок ${stage} з 6`}>
          <div className="bmb-track" />
          <div className="bmb-fill" style={{ width: `${percent}%` }} />
          <span className="bmb-cap" style={{ left: `${percent}%` }}>
            <img src="/bmb-pin.svg" alt="BMB" />
          </span>
        </div>

        {/* колишній рядок flags — прибрано */}
      </div>

      <div className="scenario-actions">
        <button className="btn agree" onClick={onAgree} disabled={!canAgree || !!busyAgree}>🤝 Погодити угоду</button>
        {onLock && (
          <button className="btn lock" onClick={onLock} disabled={!canLock || !!busyLock}>🔒 Заблокувати кошти</button>
        )}
        <button className="btn confirm" onClick={onConfirm} disabled={!canConfirm || !!busyConfirm}>✅ Підтвердити виконання</button>

        {onOpenRate && (
          <button className="btn rate" onClick={onOpenRate} disabled={props.s.status !== 'confirmed' || !!isRated}>
            {isRated ? '⭐ Оцінено' : '⭐ Оцінити'}
          </button>
        )}

        <button className="btn dispute" onClick={onDispute} disabled={!canDispute}>⚖️ Оспорити виконання</button>
        <button className="btn location" onClick={onOpenLocation} disabled={!hasCoords}>📍 Показати локацію</button>
      </div>
    </div>
  );
}
