// src/components/ReviewsModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./ReviewsModal.css";

type RatingRow = {
  id: string;
  rater_id: string;
  score: number;
  comment: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
};

function Stars10({ score }: { score: number }) {
  const s = Math.max(0, Math.min(10, Math.round(score || 0)));
  return (
    <span className="bmb-stars10" aria-label={`Оцінка ${s} з 10`}>
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className={`bmb-star ${i < s ? "on" : ""}`}>★</span>
      ))}
    </span>
  );
}

export default function ReviewsModal({
  targetUserId,
  onClose,
}: {
  targetUserId: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);

  // завантажуємо відгуки + профілі авторів
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data: ratings } = await supabase
        .from("ratings")
        .select("id,rater_id,score,comment,created_at")
        .eq("target_user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (cancelled) return;

      const list = (ratings || []) as RatingRow[];
      setRows(list);

      const raterIds = [...new Set(list.map((r) => r.rater_id))];
      if (raterIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id,name,avatar_url")
          .in("user_id", raterIds);

        if (!cancelled) {
          const map: Record<string, ProfileRow> = {};
          (profs || []).forEach((p: any) => (map[p.user_id] = p));
          setProfiles(map);
        }
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

  const items = useMemo(() => rows, [rows]);

  const handleOpenAuthor = (authorId: string) => {
    // відкриваємо шторку коментатора (MapView слухає 'avatarClick')
    try {
      window.dispatchEvent(new CustomEvent("avatarClick", { detail: authorId }));
    } catch {}
    onClose();
  };

  return (
    <div className="rev-overlay" role="dialog" aria-modal="true">
      <div className="rev-modal">
        <button className="rev-close" onClick={onClose} aria-label="Закрити">✕</button>
        <h2 className="rev-title">Відгуки</h2>

        {loading ? (
          <div className="rev-empty">Завантаження…</div>
        ) : !items.length ? (
          <div className="rev-empty">Ще немає відгуків.</div>
        ) : (
          <ul className="rev-list">
            {items.map((r) => {
              const p = profiles[r.rater_id];
              const date = new Date(r.created_at);
              const avatarSrc =
                p?.avatar_url || "/placeholder-avatar.png"; // запасна картинка

              return (
                <li key={r.id} className="rev-item">
                  <div className="rev-head">
                    <Stars10 score={r.score} />
                    <span className="rev-date">
                      {date.toLocaleDateString()}
                    </span>
                  </div>

                  {/* коментар завжди видно, переносимо довгі рядки */}
                  {r.comment && (
                    <p className="rev-comment">{r.comment}</p>
                  )}

                  <button
                    className="rev-author-btn"
                    onClick={() => handleOpenAuthor(r.rater_id)}
                    title="Відкрити профіль автора відгуку"
                  >
                    <img
                      className="rev-ava"
                      src={avatarSrc}
                      alt={p?.name || "Користувач"}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "/placeholder-avatar.png";
                      }}
                    />
                    <span className="rev-name">{p?.name || "Користувач"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
