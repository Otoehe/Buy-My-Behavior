import React, { useEffect } from 'react';
import './CelebrationToast.css';


type Variant = 'customer' | 'executor';
interface Props { open: boolean; variant: Variant; onClose: () => void; logo?: React.ReactNode; }

const DefaultLogo = () => (
  <div className="ct-logo" aria-hidden>
    <svg viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="22" fill="#000" />
      <path d="M15 26c0-5 4-9 9-9s9 4 9 9-4 9-9 9-9-4-9-9zm5.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 0 0-7 0z" fill="#fff"/>
    </svg>
  </div>
);

export default function CelebrationToast({ open, variant, onClose, logo }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const title = variant === 'customer'
    ? 'Ваш сценарій виконаний'
    : 'Ви отримали подяку, загляньте в гаманець';

  const subtitle = variant === 'customer'
    ? 'Escrow завершив виплату. Дякуємо за використання BMB!'
    : 'Кошти зараховано виконавцю. Перевірте гаманець.';

  return (
    <div className="ct-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ct-confetti">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className={`ct-piece ct-piece-${(i % 6) + 1}`} />
        ))}
      </div>

      <div className="ct-card">
        {logo ?? <DefaultLogo />}

        <div className="ct-bubble">
          <span className="ct-bubble-float b1" />
          <span className="ct-bubble-float b2" />
          <span className="ct-bubble-float b3" />
          <span className="ct-bubble-float b4" />

          <div className="ct-check">
            <svg viewBox="0 0 64 64" className="ct-check-svg" aria-hidden>
              <circle cx="32" cy="32" r="30" className="ring" />
              <path d="M18 33.5 L28 42 L46 22" className="tick" />
            </svg>
          </div>

          <h3 className="ct-title">{title}</h3>
          <p className="ct-subtitle">{subtitle}</p>
          <button className="ct-btn" onClick={onClose} autoFocus>Добре</button>
        </div>
      </div>
    </div>
  );
}
