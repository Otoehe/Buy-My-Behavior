import React, { useEffect, useMemo, useRef, useState } from 'react';
import './ScenarioProgress.css';

type Status = 'pending' | 'agreed' | 'confirmed' | string;

export interface ScenarioForProgress {
  status: Status;
  escrow_tx_hash?: string | null;
  is_agreed_by_customer?: boolean | null;
  is_agreed_by_executor?: boolean | null;
  is_completed_by_customer?: boolean | null;
  is_completed_by_executor?: boolean | null;
}

function stepFromScenario(s: ScenarioForProgress) {
  // 0: створено → 1: погоджено → 2: escrow → 3: виконавець підтвердив
  // → 4: замовник підтвердив → 5: виплачено
  let step = 0;
  if (s.is_agreed_by_customer && s.is_agreed_by_executor) step = 1;
  if (s.escrow_tx_hash) step = 2;
  if (s.is_completed_by_executor) step = 3;
  if (s.is_completed_by_customer) step = 4;
  if (s.status === 'confirmed') step = 5;
  return step;
}

function fmtAmount(v?: number | null, cur = 'USDT') {
  if (v == null) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} ${cur}`;
}

export default function ScenarioProgress({
  s,
  amount,
  currency = 'USDT',
  logoSrc = '/brand/logo-round.svg',
  editable = true,
  onAmountCommit,
}: {
  s: ScenarioForProgress;
  amount?: number | null;
  currency?: string;
  logoSrc?: string;
  editable?: boolean;
  onAmountCommit?: (val: number | null) => void | Promise<void>;
}) {
  const steps = 6;
  const idx = stepFromScenario(s);
  const pct = (idx / (steps - 1)) * 100;
  const alignRight = pct > 85;

  const [isEditing, setEditing] = useState(false);
  const [local, setLocal] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (isEditing) inputRef.current?.focus(); }, [isEditing]);

  useEffect(() => {
    if (!isEditing) {
      if (amount == null || Number.isNaN(Number(amount))) setLocal('');
      else setLocal(String(amount));
    }
  }, [amount, isEditing]);

  const pillDisabled = useMemo(
    () => !editable || s.status === 'agreed' || s.status === 'confirmed',
    [editable, s.status]
  );

  const commit = async () => {
    if (!onAmountCommit) { setEditing(false); return; }
    const trimmed = local.trim();
    if (trimmed === '') { await onAmountCommit(null); setEditing(false); return; }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num <= 0) {
      setLocal(amount == null ? '' : String(amount));
      setEditing(false);
      return;
    }
    await onAmountCommit(num);
    setEditing(false);
  };

  return (
    <div className="sp">
      <div className="sp-ribbon">
        <div className="sp-fill" style={{ width: `${pct}%` }}>
          <div className="sp-shimmer" />
        </div>

        <div className="sp-logoCap" style={{ left: `calc(${pct}% - 16px)` }}>
          {logoSrc ? <img src={logoSrc} alt="" /> : null}
        </div>

        {Array.from({ length: steps - 1 }).map((_, i) => (
          <div key={i} className="sp-tick" style={{ left: `${((i + 1) / (steps - 1)) * 100}%` }} />
        ))}

        <div
          className={`sp-amountPill ${pillDisabled ? 'is-disabled' : 'is-editable'}`}
          style={alignRight ? { right: 0 } : { left: `calc(${pct}% + 24px)` }}
          onClick={() => { if (!pillDisabled) setEditing(true); }}
          title={pillDisabled ? undefined : 'Клікніть, щоб змінити суму'}
        >
          {!isEditing && <span className="sp-amountText">{fmtAmount(amount, currency) || `— ${currency}`}</span>}
          {isEditing && (
            <form onSubmit={(e) => { e.preventDefault(); commit(); }} style={{ display: 'inline' }}>
              <input
                ref={inputRef}
                className="sp-amountInput"
                type="number"
                step="0.000001"
                min={0}
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Escape') { setEditing(false); setLocal(amount == null ? '' : String(amount)); } }}
              />
              <span className="sp-cur">{currency}</span>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
