import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { upsertRating } from '../lib/ratings';
import './RateModal.css';

type Props = {
  scenarioId: string;
  counterpartyId: string;        // кого оцінюємо
  onDone?: () => void;
  disabled?: boolean;
};

/** 10 чорних зірок з hover-прев’ю та керуванням з клавіатури */
function Stars10({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <div
      className="rate-stars"
      role="radiogroup"
      aria-label="Оцінка від 1 до 10"
      onMouseLeave={() => setHover(null)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); onChange(Math.min(10, value + 1)); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); onChange(Math.max(1, value - 1)); }
      }}
      tabIndex={0}
    >
      {Array.from({ length: 10 }).map((_, i) => {
        const n = i + 1;
        const active = n <= shown;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} з 10`}
            aria-checked={n === value}
            role="radio"
            className={`rate-star ${active ? 'is-active' : ''}`}
            disabled={disabled}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onClick={() => onChange(n)}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

export default function RateCounterpartyModal({
  scenarioId,
  counterpartyId,
  onDone,
  disabled,
}: Props) {
  const [open, setOpen]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const [score, setScore] = useState<number>(10);      // за замовчуванням — 10/10
  const [comment, setComment] = useState('');

  // створюємо/знаходимо корінь для порталів
  const modalRoot = useMemo(() => {
    let el = document.getElementById('bmb-rate-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bmb-rate-root';
      document.body.appendChild(el);
    }
    return el;
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await upsertRating({
        scenarioId,
        rateeId: counterpartyId,
        score,
        comment: comment.trim() || undefined,
      });
      setOpen(false);
      setComment('');
      onDone?.();
      alert('Рейтинг збережено ✅');
    } catch (e: any) {
      alert(e?.message ?? 'Помилка під час збереження рейтингу');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="rate-open-btn"
        onClick={() => setOpen(true)}
        disabled={!!disabled || busy}
      >
        ⭐ Оцінити
      </button>

      {open && createPortal(
        <div className="rate-overlay" onClick={() => !busy && setOpen(false)}>
          <div
            className="rate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rate-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="rate-title" className="rate-title">Оцініть контрагента</h3>

            <Stars10 value={score} onChange={setScore} disabled={busy} />

            <textarea
              className="rate-textarea"
              placeholder="Короткий коментар (необов'язково)"
              value={comment}
              maxLength={600}
              onChange={(e) => setComment(e.target.value)}
              disabled={busy}
            />

            <div className="rate-actions">
              <button className="rate-btn muted" onClick={() => setOpen(false)} disabled={busy}>
                Скасувати
              </button>
              <button className="rate-btn primary" onClick={submit} disabled={busy}>
                {busy ? '…' : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>,
        modalRoot
      )}
    </>
  );
}
