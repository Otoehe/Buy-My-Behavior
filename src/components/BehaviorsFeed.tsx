// src/components/BehaviorsFeed.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ShareModal from './ShareModal';
import './BehaviorsFeed.css';
import './Icons.css';
import { voteOnDispute, getVoteCounts, getMyVote, type VoteChoice } from '../lib/disputeApi';
import { enqueueLike, enqueueVote } from '../lib/offlineQueue';

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

type DisputeInfo = {
  disputeId: string;
  counts: Counts;
  myVote: VoteChoice | null;
  created_at?: string | null;
  status?: string | null;
  winner?: 'executor' | 'customer' | null;
};

const isVotingClosed = (m?: DisputeInfo) => {
  if (!m) return true;
  if (m.status === 'closed') return true;
  const started = m.created_at ? new Date(m.created_at).getTime() : 0;
  const timeOver = started ? (Date.now() - started) >= 7 * 24 * 60 * 60 * 1000 : false; // 7 днів
  const capOver = (m.counts?.total || 0) >= 101;
  return timeOver || capOver;
};

const BehaviorsFeed: React.FC = () => {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [scenarioTextByBehavior, setScenarioTextByBehavior] = useState<Record<number, ScenarioText>>({});
  const [disputeMeta, setDisputeMeta] = useState<Record<number, DisputeInfo>>({});
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
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

    // ---- A) behavior -> disputeId
    const behaviorIds = processed.map(b => b.id);
    const knownDisputeIds = processed.filter(b => !!b.dispute_id).map(b => b.dispute_id!) as string[];

    const { data: byBehavior } = await supabase
      .from('disputes')
      .select('id, behavior_id, scenario_id')
      .in('behavior_id', behaviorIds);

    const disputeIdByBehavior: Record<number, string> = {};
    (byBehavior || []).forEach((d: any) => {
      if (d?.behavior_id && d?.id) disputeIdByBehavior[d.behavior_id as number] = d.id as string;
    });
    processed.forEach(b => {
      if (b.dispute_id && !disputeIdByBehavior[b.id]) disputeIdByBehavior[b.id] = b.dispute_id!;
    });

    // ---- B) disputeId -> scenario_id (+ meta)
    const disputeIds = Array.from(new Set(Object.values(disputeIdByBehavior).concat(knownDisputeIds)));
    let disputesRows: any[] = [];
    if (disputeIds.length) {
      const { data: d2 } = await supabase
        .from('disputes')
        .select('id, scenario_id, created_at, status, winner')
        .in('id', disputeIds);
      disputesRows = d2 || [];
    }
    const scenarioIdByDispute: Record<string, string> = {};
    const disputeInfoById: Record<string, { created_at?: string | null; status?: string | null; winner?: string | null }> = {};
    disputesRows.forEach((d: any) => {
      if (d?.id && d?.scenario_id) scenarioIdByDispute[d.id] = d.scenario_id as string;
      if (d?.id) disputeInfoById[d.id] = { created_at: d.created_at, status: d.status, winner: d.winner };
    });

    // ---- C) звичайні поведінки -> scenario_id через proofs
    const normalBehaviors = processed.filter(b => !disputeIdByBehavior[b.id]);
    const { data: proofs } = await supabase
      .from('scenario_proofs')
      .select('behavior_id, scenario_id')
      .in('behavior_id', normalBehaviors.map(b => b.id));

    const scenarioIdByBehavior: Record<number, string> = {};
    (proofs || []).forEach((p: any) => {
      if (p?.behavior_id && p?.scenario_id) scenarioIdByBehavior[p.behavior_id as number] = p.scenario_id as string;
    });

    // ---- D) тексти сценаріїв
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
    scenarios.forEach((s: any) => {
      scenarioTextById[s.id] = { title: s.title || undefined, description: s.description || undefined };
    });

    setScenarioTextByBehavior(prev => {
      const next: Record<number, ScenarioText> = { ...prev };
      for (const b of processed) {
        let st: ScenarioText | undefined;
        const dispId = disputeIdByBehavior[b.id];
        if (dispId && scenarioIdByDispute[dispId]) st = scenarioTextById[scenarioIdByDispute[dispId]];
        else if (scenarioIdByBehavior[b.id]) st = scenarioTextById[scenarioIdByBehavior[b.id]];
        next[b.id] = st || { title: b.title || undefined, description: b.description || undefined };
      }
      return next;
    });

    // ініціалізація спорів + мета
    setDisputeMeta(prev => {
      const next = { ...prev };
      for (const b of processed) {
        const dispId = disputeIdByBehavior[b.id];
        if (dispId) {
          const base = next[b.id] || {
            disputeId: dispId,
            counts: { executor: 0, customer: 0, total: 0 },
            myVote: null,
          };
          const extra = disputeInfoById[dispId] || {};
          next[b.id] = { ...base, ...extra };
        }
      }
      return next;
    });

    // лічильники + мій голос
    for (const b of processed) {
      const dispId = disputeIdByBehavior[b.id];
      if (!dispId) continue;
      try {
        const [counts, mine] = await Promise.all([getVoteCounts(dispId), getMyVote(dispId)]);
        setDisputeMeta(prev => ({
          ...prev,
          [b.id]: { ...(prev[b.id] || { disputeId: dispId, counts: { executor: 0, customer: 0, total: 0 }, myVote: null }), counts, myVote: mine }
        }));
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => { fetchBehaviors(); }, [fetchBehaviors]);

  // ---------- pick most visible ----------
  const pickMostVisible = useCallback(() => {
    let bestId: string | null = null;
    let bestArea = 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const [id, el] of Object.entries(videoRefs.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      const area = w * h;
      if (area > bestArea) { bestArea = area; bestId = id; }
    }
    if (bestId && bestId !== activeVideoId) setActiveVideoId(bestId);
  }, [activeVideoId]);

  useEffect(() => {
    Object.values(videoRefs.current).forEach(v => {
      if (!v) return;
      v.pause();
      v.muted = true;
      v.volume = 0;
      v.playsInline = true;
      v.preload = 'metadata';
    });

    const io = new IntersectionObserver(
      (entries) => {
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const e of entries) {
          const id = (e.target as HTMLVideoElement).dataset.id!;
          if (e.intersectionRatio > bestRatio) { bestRatio = e.intersectionRatio; bestId = id; }
        }
        if (bestId && bestRatio > 0.35) setActiveVideoId(bestId);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], root: null, rootMargin: '0px 0px -10% 0px' }
    );

    Object.values(videoRefs.current).forEach(v => v && io.observe(v));

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(pickMostVisible);
    };
    const sc = containerRef.current || window;
    sc.addEventListener('scroll', onScroll, { passive: true });

    pickMostVisible();

    return () => {
      io.disconnect();
      sc.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [behaviors, pickMostVisible]);

  // ---------- playback control ----------
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(async ([id, v]) => {
      if (!v) return;
      if (id === activeVideoId) {
        v.loop = true;
        v.muted = true; v.volume = 0;
        try { await v.play(); } catch {}
        try {
          v.muted = false; v.volume = 1;
          await v.play();
        } catch {
          v.muted = true; v.volume = 0;
          try { await v.play(); } catch {}
        }
      } else {
        v.pause();
        v.muted = true;
        v.volume = 0;
      }
    });
  }, [activeVideoId]);

  // ---------- actions ----------
  const handleAuthorClick = (authorId?: string | null) => {
    if (authorId) navigate('/map', { state: { profile: authorId } });
  };

  const handleLike = async (behaviorId: number) => {
    if (likedIds.includes(behaviorId)) return;
    setLikedIds((s) => [...s, behaviorId]);
    setBehaviors(prev => prev.map(b => (b.id === behaviorId ? { ...b, likes_count: (b.likes_count || 0) + 1 } : b)));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('no-user');
      const { data: existingLike } = await supabase
        .from('likes')
        .select('*')
        .eq('behavior_id', behaviorId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!existingLike) {
        await supabase.from('likes').insert({
          behavior_id: behaviorId,
          user_id: user.id,
          is_like: true,
        });
      }
    } catch {
      enqueueLike(behaviorId);
    }
  };

  const handleVote = async (behaviorId: number, choice: VoteChoice) => {
    const meta = disputeMeta[behaviorId];
    if (!meta || isVotingClosed(meta)) return;
    try {
      await voteOnDispute(meta.disputeId, choice);
      const [counts, mine] = await Promise.all([getVoteCounts(meta.disputeId), getMyVote(meta.disputeId)]);
      setDisputeMeta(prev => ({ ...prev, [behaviorId]: { ...prev[behaviorId], counts, myVote: mine } }));
    } catch (e: any) {
      enqueueVote(behaviorId, meta.disputeId, choice);
      alert(e?.message || 'Офлайн: голос збережено і буде відправлено при підключенні.');
    }
  };

  const handleShare = async (url: string, title?: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: title || 'Buy My Behavior', url });
        return;
      } catch {}
    }
    setShareUrl(url);
  };

  // ---------- render ----------
  return (
    <div ref={containerRef} className="shorts-scroll-container">
      {behaviors.map((b) => {
        const src = b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url || '');
        const st = scenarioTextByBehavior[b.id] || {};
        const dm = disputeMeta[b.id];

        return (
          <div className="shorts-scroll-item" key={b.id}>
            <div className="shorts-feed-layout">
              <div className="shorts-video-wrapper">
                <video
                  src={src}
                  className="shorts-video"
                  poster={b.thumbnail_url || ''}
                  playsInline
                  preload="metadata"
                  data-id={String(b.id)}
                  onEnded={(e) => { e.currentTarget.currentTime = 0; e.currentTarget.play().catch(() => {}); }}
                  ref={(el) => (videoRefs.current[b.id] = el)}
                />

                {/* Авторський чіп (завжди є, навіть без аватарки) */}
                <button
                  className="shorts-author-chip"
                  onClick={() => handleAuthorClick(b.author_id)}
                  aria-label="Профіль автора"
                  title="Профіль автора"
                >
                  {/* fallback-літера під зображенням */}
                  <span className="shorts-author-fallback">
                    {(b.title?.[0] || 'B').toUpperCase()}
                  </span>
                  {b.author_avatar_url && (
                    <img
                      src={b.author_avatar_url}
                      alt=""
                      className="shorts-author-img"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                </button>

                {(st.title || st.description) && (
                  <div className="shorts-caption">
                    {st.title && <div className="shorts-caption-title">{st.title}</div>}
                    {st.description && <div className="shorts-caption-text">{st.description}</div>}
                  </div>
                )}

                <button
                  className="share-button"
                  style={{ position: 'absolute', top: 10, right: 10, zIndex: 10000 }}
                  onClick={() => handleShare(src, st.title)}
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
                  <>
                    {isVotingClosed(dm) && (
                      <div className="vote-closed-pill">
                        Голосування завершено
                        {dm.winner && <> · Переміг {dm.winner === 'executor' ? 'виконавець' : 'замовник'}</>}
                      </div>
                    )}

                    <div className="vote-buttons-row">
                      <button
                        onClick={() => handleVote(b.id, 'customer')}
                        disabled={dm.myVote === 'customer' || isVotingClosed(dm)}
                        className="vote-btn"
                        title="Підтримати замовника"
                      >
                        ↩️ Замовник ({dm.counts.customer})
                      </button>
                      <button
                        onClick={() => handleVote(b.id, 'executor')}
                        disabled={dm.myVote === 'executor' || isVotingClosed(dm)}
                        className="vote-btn"
                        title="Підтримати виконавця"
                      >
                        ✅ Виконавець ({dm.counts.executor})
                      </button>
                    </div>
                  </>
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
