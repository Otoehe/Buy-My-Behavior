// src/components/UserRatingsFeed.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

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
        <span key={i} className={`bmb-star ${i < s ? 'on' : ''}`}>★</span>
      ))}
    </span>
  );
}

export default function UserRatingsFeed({
  userId,
  limit = 6
}: { userId: string; limit?: number }) {
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);

  async function fetchNow() {
    if (!userId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('ratings')
      .select('id,rater_id,score,comment,created_at')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Ratings fetch error:', error);
      setRows([]);
      setLoading(false);
      return;
    }

    const r = (data || []) as RatingRow[];
    const withText = r.filter(x => typeof x.comment === 'string' && x.comment.trim() !== '');
    console.log(`[UserRatingsFeed] userId=${userId} fetched=${r.length} withComments=${withText.length}`);

    setRows(r);
    setLoading(false);

    const raterIds = [...new Set(r.map(x => x.rater_id))];
    if (raterIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id,name,avatar_url')
        .in('user_id', raterIds);
      const map: Record<string, ProfileRow> = {};
      (profs || []).forEach((p: any) => { map[p.user_id] = p; });
      setProfiles(map);
    } else {
      setProfiles({});
    }
  }

  useEffect(() => { fetchNow(); }, [userId, limit]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`ratings-feed:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ratings',
        filter: `target_user_id=eq.${userId}`
      }, () => fetchNow())
      .subscribe();

    const handler = (e: any) => {
      if (e?.detail?.userId === userId) fetchNow();
    };
    window.addEventListener('ratings:updated', handler);

    return () => {
      try { supabase.removeChannel(ch); } catch {}
      window.removeEventListener('ratings:updated', handler);
    };
  }, [userId]);

  // показуємо все (і з текстом, і без) — щоб блок точно було видно
  const items = useMemo(() => rows, [rows]);

  return (
    <div className="ratings-feed">
      <h3 className="ratings-title">Відгуки</h3>

      {loading && <p className="no-scenarios" style={{margin: '6px 0 0'}}>Завантаження…</p>}

      {!loading && items.length === 0 && (
        <p className="no-scenarios" style={{margin: '6px 0 0'}}>Поки немає відгуків</p>
      )}

      {!loading && items.length > 0 && (
        <ul className="ratings-list">
          {items.map(r => {
            const p = profiles[r.rater_id];
            const dt = new Date(r.created_at);
            const hasText = typeof r.comment === 'string' && r.comment.trim() !== '';
            return (
              <li key={r.id} className="rating-item">
                <div className="rating-head">
                  <Stars10 score={r.score} />
                  <span className="rating-date">{dt.toLocaleDateString()}</span>
                </div>
                <p className="rating-comment">
                  {hasText ? r.comment : <em>(без коментаря)</em>}
                </p>
                <div className="rating-meta">
                  {p?.avatar_url && <img src={p.avatar_url} alt="" className="rating-ava" />}
                  <span className="rating-author">{p?.name || 'Користувач'}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
