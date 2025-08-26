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

const BehaviorsFeed: React.FC = () => {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [scenarioTextByBehavior, setScenarioTextByBehavior] = useState<Record<number, ScenarioText>>({});
  const [disputeMeta, setDisputeMeta] = useState<
    Record<number, { disputeId: string; counts: Counts; myVote: VoteChoice | null }>
  >({});
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // активне відео (грає тільки воно)
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
    (byBehavior || []).forEach(d => {
      if (d?.behavior_id && d?.id) disputeIdByBehavior[d.behavior_id as number] = d.id as string;
    });
    processed.forEach(b => {
      if (b.dispute_id && !disputeIdByBehavior[b.id]) disputeIdByBehavior[b.id] = b.dispute_id;
    });

    // ---- B) disputeId -> scenario_id
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

    // ---- C) звичайні поведінки -> scenario_id через proofs
    const normalBehaviors = processed.filter(b => !disputeIdByBehavior[b.id]);
    const { data: proofs } = await supabase
      .from('scenario_proofs')
      .select('behavior_id, scenario_id')
      .in('behavior_id', normalBehaviors.map(b => b.id));

    const scenarioIdByBehavior: Record<number, string> = {};
    (proofs || []).forEach(p => {
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
    scenarios.forEach(s => (scenarioTextById[s.id] = { title: s.title || undefined, description: s.description || undefined }));

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

    // ініціалізація спорів + підвантаження лічильників
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
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => { fetchBehaviors(); }, [fetchBehaviors]);

  // ---------- вибір найвидимішого (scroll-snap) ----------
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

  // ---------- керування відтворенням ----------
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(async ([id, v]) => {
      if (!v) return;

      if (id === activeVideoId) {
        v.loop = true;
        v.muted = true; v.volume = 0;
        try { await v.play(); } catch {}

        // пробуємо увімкнути звук на активному
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

  // ---------- дії ----------
  const handleAuthorClick = (authorId?: string | null) => {
    if (authorId) navigate('/map', { state: { profile: authorId } });
  };

  const handleLike = async (behaviorId: number) => {
    if (likedIds.includes(behaviorId)) return;
    setLikedIds((s) => [...s, behaviorId]);
    // оптимістично збільшуємо
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
      // офлайн/помилка — у чергу
      enqueueLike(behaviorId);
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
      enqueueVote(behaviorId, meta.disputeId, choice);
      alert(e?.message || 'Офлайн: голос збережено і буде відправлено при підключенні.');
    }
  };

  const handleShare = async (url: string, title?: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: title || 'Buy My Behavior', url });
        return;
      } catch {
        // скасовано — падаємо на модалку
      }
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
              <div className="shorts-video-wrapper" style={{ position: 'relative' }}>
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
