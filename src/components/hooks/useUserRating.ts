import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useUserRating(userId?: string) {
  const [avgScore, setAvg] = useState<number | null>(null);
  const [ratingsCount, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let ch: any;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_ratings_stats')
        .select('avg_score, ratings_count')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        setAvg(data.avg_score !== null ? Number(data.avg_score) : null);
        setCount(data.ratings_count ? Number(data.ratings_count) : 0);
      } else {
        setAvg(null);
        setCount(0);
      }
      setLoading(false);
    };

    load();

    ch = supabase
      .channel(`realtime:ratings:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ratings', filter: `target_user_id=eq.${userId}` },
        () => load()
      )
      .subscribe();

    return () => { if (ch) supabase.removeChannel(ch); };
  }, [userId]);

  return { avgScore, ratingsCount, loading };
}
