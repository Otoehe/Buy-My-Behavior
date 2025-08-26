import React from "react";
import "./RatingStars.css";

type Props = {
  value: number;                 // 0..10
  onChange?: (v: number) => void;
  size?: number;                 // px
  readOnly?: boolean;
};

export default function RatingStars({ value, onChange, size = 22, readOnly }: Props) {
  const stars = Array.from({ length: 10 }, (_, i) => i + 1);
  return (
    <div className="stars-input" style={{ "--starSize": `${size}px` } as React.CSSProperties}>
      {stars.map((n) => {
        const active = value >= n;
        return (
          <button
            key={n}
            type="button"
            className={`star-btn ${active ? "active" : ""} ${readOnly ? "ro" : ""}`}
            onClick={() => !readOnly && onChange?.(n)}
            aria-label={`${n} / 10`}
            title={`${n} / 10`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
