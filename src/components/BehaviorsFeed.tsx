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
  const [activeVideoId, setActiveVideoId] = useState<number | null>(null);

  // mute-прапорці per video (збереження у localStorage)
  const [mutedById, setMutedById] = useState<Record<number, boolean>>({});

  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const navigate = useNavigate();

  // ---------- helpers ----------
  const getVideoSrc = (b: Behavior) =>
    b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url || '');

  const loadMuteState = useCallback((ids: number[]) => {
    const next: Record<number, boolean> = {};
    ids.forEach((id) => {
      const key = `bmb_muted_${id}`;
      const stored = localStorage.getItem(key);
      next[id] = stored === null ? true : stored === 'true';
    });
    setMutedById(next);
  }, []);

  const setMuteState = (id: number, muted: boolean) => {
    localStorage.setItem(`bmb_muted_${id}`, String(muted));
    setMutedById((prev) => ({ ...prev, [id]: muted }));
    const v = videoRefs.current[id];
    if (v) v.muted = muted;
  };

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
    loadMuteState(processed.map((b) => b.id));

    // ---- A) знайти disputeId для всіх, у кого або є dispute_id, або є запис у disputes.behavior_id
    const behaviorIds = processed.map((b) => b.id);

    const { data: byBehavior } = await supabase
      .from('disputes')
      .select('id, behavior_id, scenario_id')
      .in('behavior_id', behaviorIds);

    const disputeIdByBehavior: Record<number, string> = {};
    (byBehavior || []).forEach((d) => {
      if (d?.behavior_id && d?.id) disputeIdByBehavior[d.behavior_id as number] = d.id as string;
    });
    // доповнюємо з behaviors.dispute_id
    processed.forEach((b) => {
      if (b.dispute_id && !disputeIdByBehavior[b.id]) disputeIdByBehavior[b.id] = b.dispute_id!;
    });

    // ---- B) зібрати scenario_id:
    //   1) для спорів — з таблиці disputes (id -> scenario_id)
    const disputeIds = Array.from(new Set(Object.values(disputeIdByBehavior)));
    let disputesRows: any[] = [];
    if (disputeIds.length) {
      const { data: d2 } = await supabase
        .from('disputes')
        .select('id, scenario_id')
        .in('id', disputeIds);
      disputesRows = d2 || [];
    }
    const scenarioIdByDispute: Record<string, string> = {};
    disputesRows.forEach((d) => {
      if (d?.id && d?.scenario_id) scenarioIdByDispute[d.id] = d.scenario_id as string;
    });

    //   2) для звичайних поведінок — через scenario_proofs
    const normalBehaviors = processed.filter((b) => !disputeIdByBehavior[b.id]);
    const { data: proofs } = await supabase
      .from('scenario_proofs')
      .select('behavior_id, scenario_id')
      .in('behavior_id', normalBehaviors.map((b) => b.id));

    const scenarioIdByBehavior: Record<number, string> = {};
    (proofs || []).forEach((p) => {
      if (p?.behavior_id && p?.scenario_id)
        scenarioIdByBehavior[p.behavior_id as number] = p.scenario_id as string;
    });

    // ---- C) підтягнути самі сценарії
    const scenarioIds = new Set<string>();
    Object.values(scenarioIdByDispute).forEach((id) => id && scenarioIds.add(id));
    Object.values(scenarioIdByBehavior).forEach((id) => id && scenarioIds.add(id));

    let scenarios: any[] = [];
    if (scenarioIds.size) {
      const { data: sc } = await supabase
        .from('scenarios')
        .select('id, title, description')
        .in('id', Array.from(scenarioIds));
      scenarios = sc || [];
    }
    const scenarioTextById: Record<string, ScenarioText> = {};
    scenarios.forEach((s) => {
      scenarioTextById[s.id] = {
        title: s.title || undefined,
        description: s.description || undefined,
      };
    });

    // ---- D) скласти мапи для рендера
    setScenarioTextByBehavior((prev) => {
      const next: Record<number, ScenarioText> = { ...prev };
      for (const b of processed) {
        let st: ScenarioText | undefined;
        const dispId = disputeIdByBehavior[b.id];
        if (dispId && scenarioIdByDispute[dispId]) st = scenarioTextById[scenarioIdByDispute[dispId]];
        else if (scenarioIdByBehavior[b.id]) st = scenarioTextById[scenarioIdByBehavior[b.id]];
        // fallback — берём з behaviors
        next[b.id] = st || { title: b.title || undefined, description: b.description || undefined };
      }
      return next;
    });

    // ініціалізація спорів + асинхронне підтягування лічильників
    setDisputeMeta((prev) => {
      const next = { ...prev };
      for (const b of processed) {
        const dispId = disputeIdByBehavior[b.id];
        if (dispId) {
          next[b.id] =
            next[b.id] || {
              disputeId: dispId,
              counts: { executor: 0, customer: 0, total: 0 },
              myVote: null,
            };
        }
      }
      return next;
    });

    for (const b of processed) {
      const dispId = disputeIdByBehavior[b.id];
      if (!dispId) continue;
      try {
        const [counts, mine] = await Promise.all([getVoteCounts(dispId), getMyVote(dispId)]);
        setDisputeMeta((prev) => ({
          ...prev,
          [b.id]: { ...prev[b.id], counts, myVote: mine },
        }));
      } catch {
        // ignore
      }
    }
  }, [loadMuteState]);

  useEffect(() => {
    fetchBehaviors();
  }, [fetchBehaviors]);

  // ---------- realtime INSERT ----------
  useEffect(() => {
    const channel = supabase
      .channel('realtime:behaviors')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'behaviors' },
        async (payload) => {
          // простіше — перевантажити список (щоб підхопити зв’язки/аватар/рахунки)
          await fetchBehaviors();
        }
      );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchBehaviors]);

  // ---------- auto play/pause ----------
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLVideoElement;
          const idStr = target.dataset.id;
          const id = idStr ? Number(idStr) : NaN;
          if (!Number.isFinite(id)) return;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.9) {
            setActiveVideoId(id);
          }
        });
      },
      { threshold: [0, 0.5, 0.9] }
    );

    Object.values(videoRefs.current).forEach((v) => v && obs.observe(v));

    return () => {
      obs.disconnect();
    };
  }, [behaviors]);

  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([idStr, v]) => {
      const id = Number(idStr);
      if (!v) return;
      const shouldBeActive = activeVideoId === id;

      if (shouldBeActive) {
        // поважаємо локальний mute-стан
        const muted = mutedById[id] ?? true;
        v.muted = muted;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [activeVideoId, mutedById]);

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
    if (error) {
      console.error('Помилка лайку:', error.message);
    } else {
      setBehaviors((prev) =>
        prev.map((b) =>
          b.id === behaviorId ? { ...b, likes_count: (b.likes_count || 0) + 1 } : b
        )
      );
    }
  };

  const handleVote = async (behaviorId: number, choice: VoteChoice) => {
    const meta = disputeMeta[behaviorId];
    if (!meta) return;
    try {
      await voteOnDispute(meta.disputeId, choice);
      const [counts, mine] = await Promise.all([getVoteCounts(meta.disputeId), getMyVote(meta.disputeId)]);
      setDisputeMeta((prev) => ({
        ...prev,
        [behaviorId]: { ...prev[behaviorId], counts, myVote: mine },
      }));
    } catch (e: any) {
      alert(e?.message || 'Не вдалося проголосувати');
    }
  };

  const toggleMute = (id: number) => {
    const current = mutedById[id] ?? true;
    setMuteState(id, !current);
    if (activeVideoId === id) {
      const v = videoRefs.current[id];
      if (v) {
        v.muted = !current;
        if (!v.paused) v.play().catch(() => {});
      }
    }
  };

  // ---------- render ----------
  return (
    <div className="shorts-scroll-container">
      {behaviors.map((b) => {
        const src = getVideoSrc(b);
        const st = scenarioTextByBehavior[b.id] || {};
        const dm = disputeMeta[b.id];

        return (
          <div className="shorts-scroll-item" key={b.id}>
            <div className="shorts-feed-layout">
              <div className="shorts-video-wrapper">
                {/* Відео */}
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

                {/* Бейдж спору */}
                {(b.is_dispute_evidence || dm) && (
                  <div
                    className="badge-dispute"
                    title="Доказ у спорі"
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: 'rgba(255, 204, 0, .95)',
                      color: '#111',
                      fontWeight: 700,
                      fontSize: 12,
                      boxShadow: '0 2px 6px rgba(0,0,0,.2)',
                    }}
                  >
                    DISPUTE
                  </div>
                )}

                {/* Заголовок/опис сценарію */}
                {(st.title || st.description) && (
                  <div className="sr-title-box">
                    {st.title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{st.title}</div>}
                    {st.description && <div style={{ opacity: 0.95 }}>{st.description}</div>}
                  </div>
                )}

                {/* Аватар автора — кружечок знизу зліва */}
                {!!b.author_avatar_url && (
                  <img
                    className="shorts-author-avatar"
                    src={b.author_avatar_url}
                    alt="Author avatar"
                    onClick={() => handleAuthorClick(b.author_id)}
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}

                {/* Кнопка Share у правому верхньому куті */}
                <button
                  className="share-button"
                  style={{ position: 'absolute', top: 10, right: 10, zIndex: 10000 }}
                  onClick={() => setShareUrl(src)}
                  title="Поділитись"
                >
                  <i className="fa-solid fa-share-nodes"></i>
                </button>

                {/* Права панель кнопок (лайк + mute) */}
                <div
                  className="shorts-buttons-panel"
                  style={{ zIndex: 9999, position: 'absolute', top: '10%', right: '5%' }}
                >
                  <button onClick={() => handleLike(b.id)} title="Подобається">
                    <i className="fa-regular fa-heart"></i>
                    {b.likes_count > 0 && <span className="reaction-count white-thin">{b.likes_count}</span>}
                  </button>

                  <button onClick={() => toggleMute(b.id)} title={mutedById[b.id] ? 'Увімкнути звук' : 'Вимкнути звук'}>
                    <i className={mutedById[b.id] ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high'}></i>
                  </button>
                </div>

                {/* Кнопки голосування при спорі */}
                {dm && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      left: 8,
                      right: 8,
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                    }}
                  >
                    <button
                      onClick={() => handleVote(b.id, 'customer')}
                      disabled={dm.myVote === 'customer'}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '10px 12px',
                        background: '#ffffffd0',
                        backdropFilter: 'blur(4px)',
                        boxShadow: '0 2px 8px rgba(0,0,0,.15)',
                        fontWeight: 600,
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
                        border: 'none',
                        borderRadius: 999,
                        padding: '10px 12px',
                        background: '#ffffffd0',
                        backdropFilter: 'blur(4px)',
                        boxShadow: '0 2px 8px rgba(0,0,0,.15)',
                        fontWeight: 600,
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
