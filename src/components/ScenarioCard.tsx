import React from 'react';

export type Status = 'pending' | 'agreed' | 'confirmed' | 'disputed' | string;

export type Scenario = {
  id: string;
  creator_id: string;
  executor_id: string;
  description: string | null;
  donation_amount_usdt: number | null;
  date: string;
  time?: string | null;
  execution_time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: Status;
  is_agreed_by_customer: boolean;
  is_agreed_by_executor: boolean;
  escrow_tx_hash?: string | null;
  is_completed_by_customer?: boolean;
  is_completed_by_executor?: boolean;
};

type Props = {
  role: 'customer' | 'executor';
  s: Scenario;

  // редагування опису/суми
  onChangeDesc?: (v: string) => void;
  onCommitDesc?: (v: string) => void | Promise<void>;
  onChangeAmount?: (v: number | null) => void;
  onCommitAmount?: (v: number | null) => void | Promise<void>;

  // дії
  onAgree?: () => void;
  onLock?: () => void;
  onConfirm?: () => void;
  onDispute?: () => void;
  onOpenLocation?: () => void;

  // доступності
  canAgree?: boolean;
  canLock?: boolean;
  canConfirm?: boolean;
  canDispute?: boolean;
  hasCoords?: boolean;

  // стан кнопок
  busyAgree?: boolean;
  busyLock?: boolean;
  busyConfirm?: boolean;

  // опціонально приховати деякі кнопки в конкретних етапах
  hideLock?: boolean;
  hideConfirm?: boolean;
  hideDispute?: boolean;

  // рейтинг (якщо використовується)
  isRated?: boolean;
  onOpenRate?: () => void;
};

export default function ScenarioCard(props: Props) {
  const {
    s, role,
    onChangeDesc, onCommitDesc,
    onChangeAmount, onCommitAmount,
    onAgree, onLock, onConfirm, onDispute, onOpenLocation,
    canAgree, canLock, canConfirm, canDispute, hasCoords,
    busyAgree, busyLock, busyConfirm,
    hideLock, hideConfirm, hideDispute,
    isRated, onOpenRate,
  } = props;

  const confirmed = s.status === 'confirmed';

  // локальні хелпери перетворення значення суми
  const amountToString = (v: number | null) => (v ?? '') as any;
  const handleAmountChange = (raw: string) => {
    if (!onChangeAmount) return;
    if (raw === '') { onChangeAmount(null); return; }
    const v = parseFloat(raw);
    onChangeAmount(Number.isFinite(v) ? v : null);
  };
  const handleAmountBlur = (raw: string) => {
    if (!onCommitAmount) return;
    if (confirmed) return;
    if (raw === '') { onCommitAmount(null); return; }
    const v = parseFloat(raw);
    onCommitAmount(Number.isFinite(v) ? v : null);
  };

  // стилі (адитивно, без зміни існуючих класів)
  const hintStyle: React.CSSProperties = {
    fontSize: 12,
    lineHeight: '16px',
    opacity: 0.8,
    marginBottom: 8,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    lineHeight: '18px',
    marginBottom: 6,
    opacity: 0.9,
  };
  const amountPillStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: 9999,
    padding: '4px 8px',
  };
  const amountInputStyle: React.CSSProperties = {
    borderRadius: 9999,
    padding: '14px 16px',
    fontSize: 18,
    height: 48,
    outline: 'none',
  };

  return (
    <div className="scenario-card" data-card-id={s.id}>
      <div className="scenario-info">

        {/* 🔔 НАГАДУВАННЯ над полем опису */}
        <div style={hintStyle}>
          Опис сценарію і сума добровільного донату редагуються обома учасниками до Погодження угоди.
        </div>

        {/* ОПИС */}
        <div>
          <strong>Опис:</strong><br />
          <textarea
            value={s.description ?? ''}
            maxLength={1000}
            onChange={(e) => onChangeDesc?.(e.target.value)}
            onBlur={(e) => onCommitDesc?.(e.target.value)}
            disabled={confirmed}
            style={{ width: '100%' }}
          />
        </div>

        {/* МЕТА (дата/час) */}
        <div className="meta-row" style={{ marginTop: 8 }}>
          <div className="meta-col">
            <div className="meta-label">Дата:</div>
            <div className="meta-value">{s.date}</div>
          </div>
          <div className="meta-col">
            <div className="meta-label">Час:</div>
            <div className="meta-value">{s.time || '—'}</div>
          </div>
        </div>

        {/* СУМА */}
        <div className="amount-row" style={{ marginTop: 10 }}>
          <label className="amount-label" style={labelStyle}>
            Сума добровільного донату на підтримку креативності
          </label>
          <div className="amount-pill" style={amountPillStyle}>
            <input
              className="amount-input"
              type="number"
              step="0.000001"
              value={amountToString(s.donation_amount_usdt)}
              placeholder="—"
              onChange={(e) => handleAmountChange((e.target as HTMLInputElement).value)}
              onBlur={(e) => handleAmountBlur((e.target as HTMLInputElement).value)}
              disabled={confirmed}
              style={amountInputStyle}
            />
            <span className="amount-unit">USDT</span>
          </div>
        </div>
      </div>

      {/* КНОПКИ ДІЙ */}
      <div className="scenario-actions">
        {/* Погодити угоду */}
        <button
          className="btn agree"
          onClick={onAgree}
          disabled={!canAgree || !!busyAgree}
        >
          {busyAgree ? '…' : '🤝 Погодити угоду'}
        </button>

        {/* Забронювати кошти (може бути прихована у Виконавця) */}
        {!hideLock && (
          <button
            className="btn lock"
            onClick={onLock}
            disabled={!canLock || !!busyLock}
          >
            {busyLock ? '…' : '💳 Забронювати кошти'}
          </button>
        )}

        {/* Підтвердити виконання */}
        {!hideConfirm && (
          <button
            className="btn confirm"
            onClick={onConfirm}
            disabled={!canConfirm || !!busyConfirm}
          >
            {busyConfirm ? '…' : '✅ Підтвердити виконання'}
          </button>
        )}

        {/* Оспорити виконання (кнопка тільки коли доступна) */}
        {!hideDispute && (
          <button
            className="btn dispute"
            onClick={onDispute}
            disabled={!canDispute}
          >
            ⚖️ Оспорити виконання
          </button>
        )}

        {/* Локація — завжди активна, якщо є координати */}
        <button
          className="btn location"
          onClick={onOpenLocation}
          disabled={!hasCoords}
        >
          📍 Показати локацію
        </button>

        {/* Рейтинг (якщо потрібен) */}
        {s.status === 'confirmed' && onOpenRate && (
          isRated ? (
            <span style={{ marginLeft: 8, opacity: 0.85 }}>⭐ Оцінено</span>
          ) : (
            <button className="btn" onClick={onOpenRate}>⭐ Оцінити</button>
          )
        )}
      </div>
    </div>
  );
}
