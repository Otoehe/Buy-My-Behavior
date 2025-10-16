// src/lib/ratings.ts
import { supabase } from './supabase';

export interface Rating {
  id: string;
  order_id: string;           // DB: order_id (was scenario_id in code)
  rater_id: string;
  target_user_id: string;     // DB: target_user_id (was ratee_id in code)
  score: number;
  comment?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RatingStats {
  user_id: string;
  count_ratings: number;      // mapped from DB field ratings_count
  avg_score: number;
  // зіркові поля лишаємо як заглушки — у нашій в’юшці їх немає
  star_1_count: number;
  star_2_count: number;
  star_3_count: number;
  star_4_count: number;
  star_5_count: number;
  last_rating_at: string | null;
}

export async function upsertRating(params: {
  scenarioId: string;   // лишаємо стару назву аргумента для сумісності
  rateeId: string;
  score: number;
  comment?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const payload = {
    order_id: params.scenarioId,             // ✅ мапимо на order_id
    rater_id: user.id,
    target_user_id: params.rateeId,          // ✅ мапимо на target_user_id
    score: Math.max(1, Math.min(10, Math.round(params.score))), // клемп 1–10
    comment: params.comment ?? null
  };

  // ✅ конфлікт по правильному індексу (order_id, rater_id)
  const { data, error } = await supabase
    .from('ratings')
    .upsert(payload, { onConflict: 'order_id,rater_id' })
    .select()
    .single();

  if (error) throw error;

  // 🔔 підштовхнути всі бейджі/віджети рейтингу оновитись у поточній вкладці
  try {
    window.dispatchEvent(new CustomEvent('ratings:updated', {
      detail: { userId: params.rateeId }
    }));
  } catch {}

  return data as Rating;
}

export async function getUserRatingStats(userId: string) {
  // ✅ читаємо правильну в’юшку user_ratings_stats
  const { data, error } = await supabase
    .from('user_ratings_stats')
    .select('user_id, avg_score, ratings_count')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;

  if (!data) {
    return {
      user_id: userId,
      count_ratings: 0,
      avg_score: 0,
      star_1_count: 0,
      star_2_count: 0,
      star_3_count: 0,
      star_4_count: 0,
      star_5_count: 0,
      last_rating_at: null
    } as RatingStats;
  }

  // мапимо назви полів ПІД твій інтерфейс
  return {
    user_id: data.user_id,
    count_ratings: data.ratings_count ?? 0,
    avg_score: data.avg_score ?? 0,
    star_1_count: 0,
    star_2_count: 0,
    star_3_count: 0,
    star_4_count: 0,
    star_5_count: 0,
    last_rating_at: null
  } as RatingStats;
}

export function subscribeProfileRatings(userId: string, cb: (payload: any) => void) {
  // ✅ слухаємо по правильному стовпцю target_user_id
  return supabase
    .channel(`ratings:user:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'ratings', filter: `target_user_id=eq.${userId}` },
      cb
    )
    .subscribe();
}
