// src/lib/disputeApi.ts
import { supabase } from './supabase';
import { uploadVideoToLighthouse } from './lighthouseUpload';

/* ============= Типи ============= */
export type DisputeRow = {
  id: string;
  scenario_id: string;
  status: 'open' | 'closed' | string;
  behavior_id: number | null;
  creator_id?: string | null;
  executor_id?: string | null;
  created_at?: string | null;
  winner?: VoteChoice | null;
  closed_at?: string | null;
};

export type ScenarioLite = {
  id: string;
  creator_id: string;
  executor_id: string;
};

export type VoteChoice = 'executor' | 'customer';

/* ============= Хелпери ============= */
async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Потрібно увійти.');
  return uid;
}

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

async function uploadVideoAndGetUrl(namespace: string, file: File): Promise<string> {
  try {
    // сучасна сигнатура {scenarioId, files}
    // @ts-ignore
    const up = await uploadVideoToLighthouse({ scenarioId: namespace, files: [file] });
    const url = typeof up === 'string' ? up : (up?.url as string | undefined);
    if (url) return url;
  } catch { /* спробуємо стару */ }
  // стара сигнатура: (file) => string | {url}
  // @ts-ignore
  const alt = await uploadVideoToLighthouse(file);
  if (typeof alt === 'string' && alt) return alt;
  if (typeof alt === 'object' && alt?.url) return alt.url as string;
  throw new Error('Не вдалося отримати URL завантаження відео');
}

async function uploadToStorage(folder: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'mp4';
  const path = `${folder || 'general'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('dispute_evidence')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from('dispute_evidence').getPublicUrl(path);
  return pub.publicUrl;
}

/* ============= Читання/створення спору ============= */
export async function getDispute(disputeId: string): Promise<DisputeRow | null> {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', disputeId)
    .maybeSingle();
  if (error) throw error;
  return (data as DisputeRow) ?? null;
}

export async function getLatestDisputeByScenario(scenarioId: string): Promise<DisputeRow | null> {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('scenario_id', scenarioId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[getLatestDisputeByScenario] error:', error);
    throw error;
  }
  return (data as DisputeRow) || null;
}

export async function ensureDisputeRowForScenario(s: ScenarioLite): Promise<DisputeRow> {
  const existing = await getLatestDisputeByScenario(s.id);
  if (existing && existing.status === 'open') return existing;

  const { data, error } = await supabase
    .from('disputes')
    .insert([{
      scenario_id: s.id,
      creator_id: s.creator_id,
      executor_id: s.executor_id,
      status: 'open',
      behavior_id: null,
    }])
    .select('*')
    .single();

  if (error) {
    console.error('[ensureDisputeRowForScenario] create error:', error);
    throw error;
  }
  return data as DisputeRow;
}

/** Сумісний шім: ініціювати спір по сценарію. */
export const initiateDispute = async (arg: { scenarioId: string } | string): Promise<DisputeRow> => {
  const scenarioId = typeof arg === 'string' ? arg : arg.scenarioId;
  const s = await getScenarioLite(scenarioId);
  return ensureDisputeRowForScenario(s);
};

/* ============= Завантаження доказів (2 сигнатури) ============= */
export function uploadEvidenceAndAttach(disputeId: string, file: File, userId?: string): Promise<{ behavior_id: number; url: string }>;
export function uploadEvidenceAndAttach(file: File, scenarioId: string): Promise<{ behavior_id: number; url: string }>;
export async function uploadEvidenceAndAttach(a: any, b: any, c?: any): Promise<{ behavior_id: number; url: string }> {
  // А) (disputeId, file, userId?)
  if (typeof a === 'string' && b instanceof File) {
    const disputeId: string = a;
    const file: File = b;
    const userId: string = c || (await currentUserId());

    let url: string;
    try { url = await uploadVideoAndGetUrl(disputeId, file); }
    catch { url = await uploadToStorage(disputeId, file); }

    const { data: beh, error: behErr } = await supabase
      .from('behaviors')
      .insert([{
        author_id: userId,
        title: 'Dispute evidence',
        description: 'Video evidence for dispute',
        ipfs_cid: null,
        file_url: url,
        is_dispute_evidence: true,
        dispute_id: disputeId,
      }])
      .select('id')
      .single();
    if (behErr) { console.error('[uploadEvidenceAndAttach] behavior insert error:', behErr); throw behErr; }
    const behavior_id = (beh as any).id as number;

    const { error: linkErr } = await supabase
      .from('disputes')
      .update({ behavior_id })
      .eq('id', disputeId);
    if (linkErr) { console.error('[uploadEvidenceAndAttach] link error:', linkErr); throw linkErr; }

    return { behavior_id, url };
  }

  // Б) (file, scenarioId)
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
  } catch { return null; }
}

export async function getVoteCounts(disputeId: string): Promise<{ executor: number; customer: number; total: number }> {
  // швидко — з view
  const { data } = await supabase
    .from('dispute_vote_counts')
    .select('executor_votes, customer_votes, total_votes')
    .eq('dispute_id', disputeId)
    .maybeSingle();

  if (data) {
    return { executor: data.executor_votes || 0, customer: data.customer_votes || 0, total: data.total_votes || 0 };
  }

  // фолбек — напряму
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
  // якщо маєш RPC з правами — можна спробувати; інакше фолбек
  try {
    if (!winner) {
      const { data, error } = await supabase.rpc('close_dispute_rpc', { p_dispute_id: disputeId });
      if (error) throw error;
      return data;
    }
  } catch {
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes', filter: `id=eq.${disputeId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: `dispute_votes`, filter: `dispute_id=eq.${disputeId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
