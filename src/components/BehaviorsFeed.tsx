// src/components/BehaviorsFeed.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ShareModal from './ShareModal';
import './BehaviorsFeed.css';
import './Icons.css';
import { voteOnDispute, getVoteCounts, getMyVote, type VoteChoice } from '../lib/disputeApi';

interface Behavior {
  id: number;
  ipfs_cid: string | null;
  file_url?: string | null;
  thumbnail_url?: string | null;
  title?: string | null;
  description?: string | null;
  created_at?: string | null;
  author_id?: string | null;
  author_avatar_url?: string | null;
  likes_count: number;
  dislikes_count: number;
  is_dispute_evidence?: boolean;
  dispute_id?: string | null;
}

type ScenarioText = { title?: string; description?: string };
type Counts = { executor: number; customer: number; total: number };

const BehaviorsFeed: React.FC = () => {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [scenarioTextByBehavior, setScenarioTextByBehavior] = useState<Record<number, ScenarioText>>({});
  const [disputeMeta, setDisputeMeta] = useState<
    Record<number, { disputeId: string; counts: Counts; myVote: VoteChoice | null }>
  >({});
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const navigate = useNavigate();

  // ---------- FETCH ----------
  const fetchBehaviors = useCallback(async () => {
    const { data, error } = await supabase
      .from('behaviors')
      .select(`*, profiles:author_id(avatar_url)`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Помилка при завантаженні поведінок:', error);
      return;
    }

    const processed: Behavior[] = (data || []).map((b: any) => ({
      ...b,
      author_avatar_url: b.profiles?.avatar_url || '',
      likes_count: b.likes_count || 0,
      dislikes_count: b.dislikes_count || 0,
    }));

    setBehaviors(processed);

    // ---- A) знайти disputeId для всіх, у кого або є dispute_id, або є запис у disputes.behavior_id
    const behaviorIds = processed.map(b => b.id);
    const knownDisputeIds = processed.filter(b => !!b.dispute_id).map(b => b.dispute_id!) as string[];

    const { data: byBehavior } = await supabase
      .from('disputes')
      .select('id, behavior_id, scenario_id')
      .in('behavior_id', behaviorIds);

    // behavior.id -> disputeId
    const disputeIdByBehavior: Record<number, string> = {};
    (byBehavior || []).forEach(d => {
      if (d?.behavior_id && d?.id) disputeIdByBehavior[d.behavior_id as number] = d.id as string;
    });
    // доповнюємо з behaviors.dispute_id
    processed.forEach(b => {
      if (b.dispute_id && !disputeIdByBehavior[b.id]) disputeIdByBehavior[b.id] = b.dispute_id;
    });

    // ---- B) зібрати scenario_id:
    //   1) для спорів — з таблиці disputes (за disputeId або за behavior_id)
    const disputeIds = Array.from(new Set(Object.values(disputeIdByBehavior).concat(knownDisputeIds)));
    let disputesRows: any[] = [];
    if (disputeIds.length) {
      const { data: d2 } = await supabase.from('disputes').select('id, scenario_id').in('id', disputeIds);
      disputesRows = d2 || [];
    }
    const scenarioIdByDispute: Record<string, string> = {};
    disputesRows.forEach(d => {
      if (d?.id && d?.scenario_id) scenarioIdByDispute[d.id] = d.scenario_id as string;
    });

    //   2) для звичайних поведінок — через scenario_proofs
    const normalBehaviors = processed.filter(b => !disputeIdByBehavior[b.id]);
    const { data: proofs } = await supabase
      .from('scenario_proofs')
      .select('behavior_id, scenario_id')
      .in('behavior_id', normalBehaviors.map(b => b.id));

    const scenarioIdByBehavior: Record<number, string> = {};
    (proofs || []).forEach(p => {
      if (p?.behavior_id && p?.scenario_id) scenarioIdByBehavior[p.behavior_id as number] = p.scenario_id as string;
    });

    // ---- C) підтягнути самі сценарії
    const scenarioIds = new Set<string>();
    Object.values(scenarioIdByDispute).forEach(id => id && scenarioIds.add(id));
    Object.values(scenarioIdByBehavior).forEach(id => id && scenarioIds.add(id));
    let scenarios: any[] = [];
    if (scenarioIds.size) {
      const { data: sc } = await supabase
        .from('scenarios')
        .select('id, title, description')
        .in('id', Array.from(scenarioIds));
      scenarios = sc || [];
    }
    const scenarioTextById: Record<string, ScenarioText> = {};
    scenarios.forEach(s => (scenarioTextById[s.id] = { title: s.title || undefined, description: s.description || undefined }));

    // ---- D) скласти мапи для рендера
    setScenarioTextByBehavior(prev => {
      const next: Record<number, ScenarioText> = { ...prev };
      for (const b of processed) {
        let st: ScenarioText | undefined;
        const dispId = disputeIdByBehavior[b.id];
        if (dispId && scenarioIdByDispute[dispId]) st = scenarioTextById[scenarioIdByDispute[dispId]];
        else if (scenarioIdByBehavior[b.id]) st = scenarioTextById[scenarioIdByBehavior[b.id]];
        // fallback: якщо сценарію не знайшли — показати title/description з behaviors
        next[b.id] = st || { title: b.title || undefined, description: b.description || undefined };
      }
      return next;
    });

    // ініціалізація спорів + асинхронне підтягування лічильників
    setDisputeMeta(prev => {
      const next = { ...prev };
      for (const b of processed) {
        const dispId = disputeIdByBehavior[b.id];
        if (dispId) {
          next[b.id] = next[b.id] || { disputeId: dispId, counts: { executor: 0, customer: 0, total: 0 }, myVote: null };
        }
      }
      return next;
    });

    for (const b of processed) {
      const dispId = disputeIdByBehavior[b.id];
      if (!dispId) continue;
      try {
        const [counts, mine] = await Promise.all([getVoteCounts(dispId), getMyVote(dispId)]);
        setDisputeMeta(prev => ({ ...prev, [b.id]: { ...prev[b.id], counts, myVote: mine } }));
      } catch { /* ігноруємо */ }
    }
  }, []);

  useEffect(() => { fetchBehaviors(); }, [fetchBehaviors]);

  // ---------- auto play/pause ----------
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        const target = entry.target as HTMLVideoElement;
        const id = target.dataset.id;
        if (id && entry.isIntersecting) setActiveVideoId(id);
      }),
      { threshold: 0.9 }
    );
    Object.values(videoRefs.current).forEach(v => v && observer.observe(v));
    return () => observer.disconnect();
  }, [behaviors]);

  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, v]) => {
      if (!v) return;
      if (id === activeVideoId) { v.muted = false; v.play().catch(() => {}); }
      else { v.pause(); v.muted = true; }
    });
  }, [activeVideoId]);

  // ---------- actions ----------
  const handleAuthorClick = (authorId?: string | null) => {
    if (authorId) navigate('/map', { state: { profile: authorId } });
  };

  const handleLike = async (behaviorId: number) => {
    if (likedIds.includes(behaviorId)) return;
    setLikedIds((s) => [...s, behaviorId]);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return alert('Потрібно увійти');

    const { data: existingLike } = await supabase
      .from('likes')
      .select('*')
      .eq('behavior_id', behaviorId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingLike) return;

    const { error } = await supabase.from('likes').insert({
      behavior_id: behaviorId,
      user_id: user.id,
      is_like: true,
    });
    if (error) console.error('Помилка лайку:', error.message);
    else {
      setBehaviors(prev => prev.map(b => (b.id === behaviorId ? { ...b, likes_count: (b.likes_count || 0) + 1 } : b)));
    }
  };

  const handleVote = async (behaviorId: number, choice: VoteChoice) => {
    const meta = disputeMeta[behaviorId];
    if (!meta) return;
    try {
      await voteOnDispute(meta.disputeId, choice);
      const [counts, mine] = await Promise.all([getVoteCounts(meta.disputeId), getMyVote(meta.disputeId)]);
      setDisputeMeta(prev => ({ ...prev, [behaviorId]: { ...prev[behaviorId], counts, myVote: mine } }));
    } catch (e: any) {
      alert(e?.message || 'Не вдалося проголосувати');
    }
  };

  // ---------- render ----------
  return (
    <div className="shorts-scroll-container">
      {behaviors.map((b) => {
        const src = b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url || '');
        const st = scenarioTextByBehavior[b.id] || {};
        const dm = disputeMeta[b.id]; // якщо є — показуємо кнопки

        return (
          <div className="shorts-scroll-item" key={b.id}>
            <div className="shorts-feed-layout">
              <div className="shorts-video-wrapper" style={{ position: 'relative' }}>
                <video
                  src={src}
                  className="shorts-video"
                  poster={b.thumbnail_url || ''}
                  autoPlay
                  loop
                  playsInline
                  data-id={String(b.id)}
                  ref={(el) => (videoRefs.current[b.id] = el)}
                />

                {!!b.author_avatar_url && (
                  <img
                    className="shorts-author-avatar"
                    src={b.author_avatar_url}
                    alt="Author avatar"
                    onClick={() => handleAuthorClick(b.author_id)}
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}

                {(st.title || st.description) && (
                  <div
                    style={{
                      position: 'absolute', top: 8, left: 8, right: 48,
                      padding: '8px 10px', borderRadius: 12,
                      background: 'linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.25))',
                      color: '#fff', fontSize: 14, lineHeight: 1.25,
                      maxHeight: 120, overflow: 'hidden',
                      textShadow: '0 1px 2px rgba(0,0,0,.6)',
                    }}
                  >
                    {st.title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{st.title}</div>}
                    {st.description && <div style={{ opacity: .95 }}>{st.description}</div>}
                  </div>
                )}

                <button
                  className="share-button"
                  style={{ position: 'absolute', top: 10, right: 10, zIndex: 10000 }}
                  onClick={() => setShareUrl(src)}
                  title="Поділитись"
                >
                  <i className="fa-solid fa-share-nodes"></i>
                </button>

                <div className="shorts-buttons-panel" style={{ zIndex: 9999, position: 'absolute', top: '10%', right: '5%' }}>
                  <button onClick={() => handleLike(b.id)} title="Подобається">
                    <i className="fa-regular fa-heart"></i>
                    {b.likes_count > 0 && <span className="reaction-count white-thin">{b.likes_count}</span>}
                  </button>
                </div>

                {dm && (
                  <div
                    style={{
                      position: 'absolute', bottom: 8, left: 8, right: 8,
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                    }}
                  >
                    <button
                      onClick={() => handleVote(b.id, 'customer')}
                      disabled={dm.myVote === 'customer'}
                      style={{
                        border: 'none', borderRadius: 999, padding: '10px 12px',
                        background: '#ffffffd0', backdropFilter: 'blur(4px)',
                        boxShadow: '0 2px 8px rgba(0,0,0,.15)', fontWeight: 600,
                        cursor: dm.myVote === 'customer' ? 'not-allowed' : 'pointer',
                      }}
                      title="Підтримати замовника"
                    >
                      ↩️ Замовник ({dm.counts.customer})
                    </button>
                    <button
                      onClick={() => handleVote(b.id, 'executor')}
                      disabled={dm.myVote === 'executor'}
                      style={{
                        border: 'none', borderRadius: 999, padding: '10px 12px',
                        background: '#ffffffd0', backdropFilter: 'blur(4px)',
                        boxShadow: '0 2px 8px rgba(0,0,0,.15)', fontWeight: 600,
                        cursor: dm.myVote === 'executor' ? 'not-allowed' : 'pointer',
                      }}
                      title="Підтримати виконавця"
                    >
                      ✅ Виконавець ({dm.counts.executor})
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
    </div>
  );
};

export default BehaviorsFeed;
