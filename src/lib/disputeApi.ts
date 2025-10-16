// src/lib/disputeApi.ts
import { supabase } from './supabase';
import { uploadVideoToLighthouse } from './lighthouseUpload';

/* ============= Типи ============= */
export type VoteChoice = 'executor' | 'customer';

export type DisputeRow = {
  id: string;
  scenario_id: string;
  status: 'open' | 'closed' | string;
  behavior_id: number | null;

  // Сумісність зі схемами:
  initiator_user_id?: string | null; // нова схема
  executor_user_id?: string | null;  // нова схема
  creator_id?: string | null;        // стара схема (не у твоїй БД)
  executor_id?: string | null;       // стара схема (не у твоїй БД)

  created_at?: string | null;
  deadline_at?: string | null;
  winner?: VoteChoice | null;
  closed_at?: string | null;
  resolution_tx_hash?: string | null;
};

export type ScenarioLite = {
  id: string;
  creator_id: string;  // в твоїй таблиці scenarios є саме creator_id
  executor_id: string; // і executor_id (див. скріни)
};

/* ============= Хелпери ============= */
async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error('Потрібно увійти.');
  return uid;
}

/** Витягує мінімум про сценарій. */
async function getScenarioLite(scenarioId: string): Promise<ScenarioLite> {
  const { data, error } = await supabase
    .from('scenarios')
    .select('id, creator_id, executor_id')
    .eq('id', scenarioId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Scenario not found');
  return data as ScenarioLite;
}

/** Підтримка двох сигнатур lighthouseUpload + фолбек у storage. */
async function uploadVideoAndGetUrl(namespace: string, file: File): Promise<string> {
  try {
    // нова сигнатура
    // @ts-ignore
    const up = await uploadVideoToLighthouse({ scenarioId: namespace, files: [file] });
    const url = typeof up === 'string' ? up : (up?.url as string | undefined);
    if (url) return url;
  } catch { /* спробуємо стару */ }

  // стара сигнатура
  // @ts-ignore
  const alt = await uploadVideoToLighthouse(file);
  if (typeof alt === 'string' && alt) return alt;
  if (typeof alt === 'object' && alt?.url) return alt.url as string;

  // фолбек у Supabase Storage (bucket: dispute_evidence)
  const ext = file.name.split('.').pop() || 'mp4';
  const path = `${namespace}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('dispute_evidence')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from('dispute_evidence').getPublicUrl(path);
  return pub.publicUrl;
}

/* ============= Читання/створення спору ============= */

/** Останній спір по сценарію (або null). */
export async function getLatestDisputeByScenario(scenarioId: string): Promise<DisputeRow | null> {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('scenario_id', scenarioId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as DisputeRow) || null;
}

/**
 * Створює (або повертає існуючий open) спір.
 * Основна схема: columns = scenario_id, initiator_user_id, executor_user_id, status, behavior_id
 * Фолбек для старої:         scenario_id, creator_id, executor_id, status, behavior_id
 */
export async function ensureDisputeRowForScenario(s: ScenarioLite): Promise<DisputeRow> {
  const existing = await getLatestDisputeByScenario(s.id);
  if (existing && existing.status === 'open') return existing;

  // пробуємо нову схему
  const tryPayloadNew = {
    scenario_id: s.id,
    initiator_user_id: s.creator_id,
    executor_user_id: s.executor_id,
    status: 'open' as const,
    behavior_id: null as number | null,
  };

  // фолбек — стара
  const tryPayloadOld = {
    scenario_id: s.id,
    creator_id: s.creator_id,
    executor_id: s.executor_id,
    status: 'open' as const,
    behavior_id: null as number | null,
  };

  // спроба №1: нові колонки
  let inserted: DisputeRow | null = null;
  let lastErr: any = null;
  try {
    const { data, error } = await supabase
      .from('disputes')
      .insert([tryPayloadNew])
      .select('*')
      .single();
    if (error) throw error;
    inserted = data as DisputeRow;
  } catch (e) {
    lastErr = e;
  }

  // спроба №2: старі колонки
  if (!inserted) {
    const { data, error } = await supabase
      .from('disputes')
      .insert([tryPayloadOld])
      .select('*')
      .single();
    if (error) {
      // покажемо першу помилку для прозорості, якщо друга теж впала
      throw lastErr || error;
    }
    inserted = data as DisputeRow;
  }

  return inserted!;
}

/**
 * Ініціювати спір. Підтримувані виклики:
 *   - initiateDispute("scenarioId")
 *   - initiateDispute({ scenarioId: "..." })
 *   - initiateDispute({ id: "...", creator_id: "...", executor_id: "..." })
 */
export async function initiateDispute(
  arg: string | { scenarioId?: string } | { id: string; creator_id: string; executor_id: string }
): Promise<DisputeRow> {
  // 1) повний об’єкт — створюємо без додаткового SELECT
  if (typeof arg === 'object' && 'id' in arg && arg.id && arg.creator_id && arg.executor_id) {
    return ensureDisputeRowForScenario({
      id: arg.id,
      creator_id: arg.creator_id,
      executor_id: arg.executor_id,
    });
  }

  // 2) { scenarioId }
  let scenarioId: string | undefined;
  if (typeof arg === 'object' && 'scenarioId' in arg) scenarioId = arg.scenarioId;
  // 3) "scenarioId"
  if (typeof arg === 'string') scenarioId = arg;

  if (!scenarioId) throw new Error('scenarioId is required');

  const s = await getScenarioLite(scenarioId);
  return ensureDisputeRowForScenario(s);
}

/* ============= Завантаження доказів (2 сигнатури) ============= */
// A) (disputeId, file, userId?)
// B) (file, scenarioId)
export function uploadEvidenceAndAttach(
  disputeId: string,
  file: File,
  userId?: string
): Promise<{ behavior_id: number; url: string }>;
export function uploadEvidenceAndAttach(
  file: File,
  scenarioId: string
): Promise<{ behavior_id: number; url: string }>;
export async function uploadEvidenceAndAttach(a: any, b: any, c?: any) {
  // A) (disputeId, file, userId?)
  if (typeof a === 'string' && b instanceof File) {
    const disputeId: string = a;
    const file: File = b;
    const uid = c || (await currentUserId());

    const url = await uploadVideoAndGetUrl(disputeId, file);

    // створюємо behavior з прапорцем доказу
    const { data: beh, error: behErr } = await supabase
      .from('behaviors')
      .insert([{
        author_id: uid,
        title: 'Dispute evidence',
        description: 'Video evidence for dispute',
        ipfs_cid: null,
        file_url: url,
        is_dispute_evidence: true,
        dispute_id: disputeId,
      }])
      .select('id')
      .single();
    if (behErr) throw behErr;

    const behavior_id = (beh as any).id as number;

    // лінкуємо behavior до спору
    const { error: linkErr } = await supabase
      .from('disputes')
      .update({ behavior_id })
      .eq('id', disputeId);
    if (linkErr) throw linkErr;

    return { behavior_id, url };
  }

  // B) (file, scenarioId)
  if (a instanceof File && typeof b === 'string') {
    const file: File = a;
    const scenarioId: string = b;
    const uid = await currentUserId();
    const s = await getScenarioLite(scenarioId);
    const d = await ensureDisputeRowForScenario(s);
    return uploadEvidenceAndAttach(d.id, file, uid);
  }

  throw new Error('Невірні аргументи uploadEvidenceAndAttach');
}

/* ============= Голосування ============= */
export async function voteOnDispute(disputeId: string, choice: VoteChoice) {
  const uid = await currentUserId();
  const { error } = await supabase
    .from('dispute_votes')
    .upsert([{ dispute_id: disputeId, user_id: uid, choice }], { onConflict: 'dispute_id,user_id' });
  if (error) throw error;
  return { ok: true };
}

export async function getMyVote(disputeId: string): Promise<VoteChoice | null> {
  try {
    const uid = await currentUserId();
    const { data, error } = await supabase
      .from('dispute_votes')
      .select('choice')
      .eq('dispute_id', disputeId)
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    return (data?.choice as VoteChoice) ?? null;
  } catch {
    return null;
  }
}

export async function getVoteCounts(disputeId: string): Promise<{ executor: number; customer: number; total: number }> {
  // Швидко з view, якщо є
  const { data } = await supabase
    .from('dispute_vote_counts')
    .select('executor_votes, customer_votes, total_votes')
    .eq('dispute_id', disputeId)
    .maybeSingle();

  if (data) {
    return {
      executor: (data as any).executor_votes || 0,
      customer: (data as any).customer_votes || 0,
      total: (data as any).total_votes || 0
    };
  }

  // Фолбек напряму
  const { data: raws, error } = await supabase
    .from('dispute_votes')
    .select('choice')
    .eq('dispute_id', disputeId);
  if (error) throw error;

  let ex = 0, cu = 0;
  (raws || []).forEach((r: any) => r.choice === 'executor' ? ex++ : r.choice === 'customer' ? cu++ : null);
  return { executor: ex, customer: cu, total: ex + cu };
}

/* ============= Закриття спору + realtime ============= */
export async function closeDispute(disputeId: string, winner?: VoteChoice) {
  // якщо є RPC — пробуємо
  try {
    if (!winner) {
      const { data, error } = await supabase.rpc('close_dispute_rpc', { p_dispute_id: disputeId });
      if (error) throw error;
      return data;
    }
  } catch {
    // фолбек: рахуємо голоси тут і просто апдейтимо рядок
    if (!winner) {
      const { executor, customer } = await getVoteCounts(disputeId);
      winner = executor > customer ? 'executor' : customer > executor ? 'customer' : null as any;
    }
    const { error } = await supabase
      .from('disputes')
      .update({ status: 'closed', winner, closed_at: new Date().toISOString() })
      .eq('id', disputeId);
    if (error) throw error;
  }
  return { ok: true };
}

/** Підписка на зміни спору/голосів. */
export function subscribeToDispute(disputeId: string, onChange: () => void) {
  const ch = supabase.channel(`realtime:dispute:${disputeId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes',      filter: `id=eq.${disputeId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dispute_votes', filter: `dispute_id=eq.${disputeId}` }, onChange)
    .subscribe();
  return () => { try { supabase.removeChannel(ch); } catch {} };
}
