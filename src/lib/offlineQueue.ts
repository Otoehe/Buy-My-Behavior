import { supabase } from './supabase';
import { voteOnDispute, type VoteChoice } from './disputeApi';

type LikeAction = { type: 'like'; behaviorId: number };
type VoteAction = { type: 'vote'; behaviorId: number; disputeId: string; choice: VoteChoice };
type OfflineAction = (LikeAction | VoteAction) & { ts: number };

const KEY = 'BMB_OFFLINE_QUEUE_V1';

function load(): OfflineAction[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OfflineAction[]) : [];
  } catch {
    return [];
  }
}

function save(q: OfflineAction[]) {
  // простий запобіжник від розростання черги
  localStorage.setItem(KEY, JSON.stringify(q.slice(0, 500)));
}

export function enqueueLike(behaviorId: number) {
  const q = load();
  q.push({ type: 'like', behaviorId, ts: Date.now() });
  save(q);
}

export function enqueueVote(behaviorId: number, disputeId: string, choice: VoteChoice) {
  const q = load();
  q.push({ type: 'vote', behaviorId, disputeId, choice, ts: Date.now() });
  save(q);
}

export async function flushOfflineQueue() {
  if (!navigator.onLine) return;

  let q = load();
  if (!q.length) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return; // без юзера не зможемо зафіксувати лайк/голос

  const rest: OfflineAction[] = [];
  for (const item of q) {
    try {
      if (item.type === 'like') {
        const { data: existing } = await supabase
          .from('likes')
          .select('*')
          .eq('behavior_id', item.behaviorId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!existing) {
          await supabase.from('likes').insert({
            behavior_id: item.behaviorId,
            user_id: user.id,
            is_like: true,
          });
        }
      } else if (item.type === 'vote') {
        await voteOnDispute(item.disputeId, item.choice);
      }
    } catch {
      // лишаємо у черзі, спробуємо пізніше
      rest.push(item);
    }
  }
  save(rest);
}
