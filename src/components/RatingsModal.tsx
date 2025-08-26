import React from 'react';
import './RatingsModal.css';

type Rater = { name: string | null; avatar_url: string | null } | null;

export type RatingItem = {
  id: string;
  score: number;
  comment: string | null;
  created_at: string;
  rater?: Rater;
};

function Stars10({ score }: { score: number }) {
  const s = Math.max(0, Math.min(10, Math.round(score || 0)));
  return (
    <span className="rm-stars10" aria-label={`Оцінка ${s} з 10`}>
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className={`rm-star ${i < s ? 'on' : ''}`}>★</span>
      ))}
    </span>
  );
}

export default function RatingsModal({
  open,
  title = 'Відгуки',
  items,
  onClose,
}: {
  open: boolean;
  title?: string;
  items: RatingItem[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="rm-overlay" onClick={onClose}>
      <div
        className="rm-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rm-head">
          <h3 className="rm-title">{title}</h3>
          <button className="rm-close" onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <div className="rm-body">
          {items.length === 0 ? (
            <div className="rm-empty">Ще немає відгуків</div>
          ) : (
            items.map((r) => (
              <div className="rm-item" key={r.id}>
                <div className="rm-item-head">
                  <Stars10 score={r.score} />
                  <span className="rm-date">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>

                {r.comment && <p className="rm-comment">{r.comment}</p>}

                <div className="rm-author">
                  <span className="rm-ava-wrap">
                    <img
                      src={r.rater?.avatar_url || '/placeholder-avatar.png'}
                      alt=""
                    />
                  </span>
                  <span className="rm-name">{r.rater?.name || 'Користувач'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
