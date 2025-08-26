// src/components/UserRatingBadge.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Props = {
  userId: string;
  size?: number;       // px розмір зірочки (дефолт 16)
  showCount?: boolean; // показувати (N) — так/ні
};

type Stats = {
  user_id: string;
  avg_score: number;     // 0..10
  ratings_count: number;
};

export default function UserRatingBadge({ userId, size = 16, showCount = true }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const fetchTimer = useRef<number | null>(null);

  const fetchStats = async () => {
    if (!userId) return;
    // дебоунс 150мс — згладжує серії подій
    if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
    fetchTimer.current = window.setTimeout(async () => {
      try {
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        setLoading(prev => (stats ? prev : true));
        const { data, error } = await supabase
          .from('user_ratings_stats')
          .select('user_id, avg_score, ratings_count')
          .eq('user_id', userId)
          .maybeSingle();
        if (!error && !ac.signal.aborted) setStats((data as any) || { user_id: userId, avg_score: 0, ratings_count: 0 });
      } finally {
        if (!abortRef.current?.signal.aborted) setLoading(false);
      }
    }, 150);
  };

  useEffect(() => {
    fetchStats();
    return () => {
      if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Realtime по ratings для конкретного користувача
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`ratings:badge:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ratings', filter: `target_user_id=eq.${userId}` },
        () => fetchStats()
      )
      .subscribe();

    // Миттєве оновлення в цій вкладці після upsert
    const handler = (e: any) => {
      if (e?.detail?.userId === userId) fetchStats();
    };
    window.addEventListener('ratings:updated', handler);

    return () => {
      try { supabase.removeChannel(ch); } catch {}
      window.removeEventListener('ratings:updated', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Обчислення для зірок
  const { full, half, rounded, label } = useMemo(() => {
    const v = Number(stats?.avg_score || 0);
    const full = Math.floor(v);
    const half = v
