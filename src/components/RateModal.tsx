import React from 'react';
import { createPortal } from 'react-dom';
import './RateModal.css';

type Props = {
  open: boolean;
  score: number;                 // 1..10
  comment: string;
  disabled?: boolean;
  onChangeScore: (v: number) => void;
  onChangeComment: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function RateModal({
  open, score, comment, disabled,
  onChangeScore, onChangeComment, onCancel, onSave
}: Props) {
  if (!open) return null;

  const Star = ({ i }: { i: number }) => (
    <button
      type="button"
      className={`rate-star ${i <= score ? 'is-active' : ''}`}
      onClick={() => onChangeScore(i)}
      aria-label={`${i} з 10`}
    >
      ★
    </button>
  );

  return createPortal(
    <div className="rate-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="rate-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="rate-title">Оцініть контрагента</h3>

        <div className="rate-stars" role="radiogroup" aria-label="Оцінка від 1 до 10">
          {Array.from({ length: 10 }, (_, k) => k + 1).map(i => <Star key={i} i={i} />)}
        </div>

        <textarea
          className="rate-textarea"
          placeholder="Короткий коментар (необов'язково)"
          value={comment}
          onChange={(e) => onChangeComment(e.target.value)}
          maxLength={600}
        />

        <div className="rate-actions">
          <button type="button" className="rate-btn muted" onClick={onCancel} disabled={disabled}>
            Скасувати
          </button>
          <button type="button" className="rate-btn primary" onClick={onSave} disabled={disabled}>
            Зберегти
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
