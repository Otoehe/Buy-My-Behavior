import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ShareModal from './ShareModal';
import DisputeVoteWidget from './DisputeVoteWidget';
import './BehaviorsFeed.css';
import './Icons.css';

type Behavior = {
  id: number;
  ipfs_cid: string | null;
  file_url?: string | null;
  thumbnail_url?: string | null;
  description?: string | null;
  created_at?: string | null;
  dispute_id?: string | null;
  author_id?: string | null;
  author_avatar_url?: string | null;
};

type ScenarioText = { title?: string; description?: string };

export default function BehaviorsFeed() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [scenarioTextByBehavior, setScenarioTextByBehavior] = useState<Record<number, ScenarioText>>({});
  const [disputeMap, setDisputeMap] = useState<Record<number, string>>({});
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mutedMap, setMutedMap] = useState<Record<number, boolean>>({});
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const navigate = useNavigate();

  /* -------------------- LOAD -------------------- */
  const load = useCallback(async () => {
    // behaviors + аватар автора
    const { data, error } = await supabase
      .from('behaviors')
      .select(`*, profiles:author_id(id, avatar_url)`)
      .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }

    const rows: Behavior[] = (data || []).map((b: any) => ({
      ...b,
      author_avatar_url: b?.profiles?.avatar_url || null,
    }));

    setBehaviors(rows);
    if (rows.length) setActiveId(rows[0].id);

    // -- A) behavior -> dispute (прямий зв'язок)
    const ids = rows.map(r => r.id);
    const { data: dispByBeh } = await supabase
      .from('disputes')
      .select('id, behavior_id, scenario_id')
      .in('behavior_id', ids);

    const dispIdByBeh: Record<number, string> = {};
    (dispByBeh || []).forEach((d: any) => {
      if (d?.behavior_id && d?.id) dispIdByBeh[d.behavior_id] = d.id;
    });

    // -- B) через proofs -> scenario_id -> disputes (беремо відкритий або найсвіжіший)
    const need = rows.filter(r => !dispIdByBeh[r.id] && !r.dispute_id).map(r => r.id);
    const scenarioIdByBehavior: Record<number, string> = {};
    if (need.length) {
      const { data: proofs } = await supabase
        .from('scenario_proofs')
        .select('behavior_id, scenario_id')
        .in('behavior_id', need);

      (proofs || []).forEach((p: any) => {
        if (p?.behavior_id && p?.scenario_id) scenarioIdByBehavior[p.behavior_id] = p.scenario_id;
      });
    }

    const scenarioIds = new Set<string>(Object.values(scenarioIdByBehavior));
    (dispByBeh || []).forEach((d: any) => { if (d?.scenario_id) scenarioIds.add(d.scenario_id); });

    // тексти сценаріїв
    const scenarioTextById: Record<string, ScenarioText> = {};
    if (scenarioIds.size) {
      const { data: sc } = await supabase
        .from('scenarios')
        .select('id, title, description')
        .in('id', Array.from(scenarioIds));
      (sc || []).forEach((s: any) => {
        scenarioTextById[s.id] = { title: s.title || undefined, description: s.description || undefined };
      });
    }

    // найкращий спір на сценарій (open > latest)
    if (scenarioIds.size) {
      const { data: dispBySc } = await supabase
        .from('disputes')
        .select('id, scenario_id, status, created_at')
        .in('scenario_id', Array.from(scenarioIds));
      const bestByScenario: Record<string, any> = {};
      (dispBySc || []).forEach((d: any) => {
        const k = d.scenario_id as string;
        const prev = bestByScenario[k];
        const better =
          !prev ||
          (prev.status !== 'open' && d.status === 'open') ||
          (prev.status === d.status && new Date(d.created_at).getTime() > new Date(prev.created_at).getTime());
        if (better) bestByScenario[k] = d;
      });
      Object.entries(scenarioIdByBehavior).forEach(([bid, sid]) => {
        const chosen = bestByScenario[sid];
        if (chosen?.id) dispIdByBeh[Number(bid)] = chosen.id;
      });
    }

    // записати тексти для кожного behavior
    setScenarioTextByBehavior(prev => {
      const next: Record<number, ScenarioText> = { ...prev };
      rows.forEach((b) => {
        const byProof = scenarioIdByBehavior[b.id];
        const byDisp = (dispByBeh || []).find((d: any) => d?.behavior_id === b.id)?.scenario_id;
        const sid = byProof || byDisp || null;
        next[b.id] = (sid && scenarioTextById[sid]) || { title: b.description || undefined, description: undefined };
      });
      return next;
    });

    // фінальна мапа спорів
    setDisputeMap(() => {
      const m: Record<number, string> = {};
      rows.forEach((b) => {
        m[b.id] = b.dispute_id || dispIdByBeh[b.id] || '';
      });
      return m;
    });

    // початковий стан mute: все muted
    setMutedMap(() => {
      const m: Record<number, boolean> = {};
      rows.forEach(b => { m[b.id] = true; });
      return m;
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  /* -------------------- SCROLL-SNAP/ACTIVE -------------------- */
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((ent) => {
          const el = ent.target as HTMLVideoElement;
          const id = Number(el.dataset.id);
          if (ent.isIntersecting && ent.intersectionRatio >= 0.6) {
            setActiveId(id);
          }
        });
      },
      { threshold: [0.6] }
    );
    Object.values(videoRefs.current).forEach(v => v && io.observe(v));
    return () => io.disconnect();
  }, [behaviors.length]);

  /* -------------------- PLAY ONLY ACTIVE -------------------- */
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([key, v]) => {
      if (!v) return;
      const id = Number(key);
      if (id === activeId) {
        v.loop = true;
        v.muted = !!mutedMap[id];
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [activeId, mutedMap]);

  /* -------------------- HELPERS -------------------- */
  const srcOf = (b: Behavior) =>
    b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url || '');

  const onToggleMute = (id: number) =>
    setMutedMap(prev => ({ ...prev, [id]: !prev[id] }));

  const handleShare = async (url: string, title?: string) => {
    if (navigator.share) {
      try { await navigator.share({ title: title || 'Buy My Behavior', url }); return; } catch {}
    }
    setShareUrl(url);
  };

  const goToAuthor = (authorId?: string | null) => {
    if (authorId) navigate('/map', { state: { profile: authorId } });
  };

  /* -------------------- RENDER -------------------- */
  return (
    <div className="bmb-feed">
      {behaviors.map((b) => {
        const st = scenarioTextByBehavior[b.id] || {};
        const dispId = disputeMap[b.id] || '';
        const muted = !!mutedMap[b.id];
        const isActive = activeId === b.id;

        return (
          <section className="bmb-item" key={b.id}>
            <div className="bmb-card">
              <div className="bmb-video-wrap">
                <video
                  className="bmb-video"
                  data-id={String(b.id)}
                  ref={(el) => (videoRefs.current[b.id] = el)}
                  src={srcOf(b)}
                  poster={b.thumbnail_url || undefined}
                  playsInline
                  muted
                  loop
                  autoPlay
                  preload="metadata"
                  onLoadedMetadata={(e)=>{ if (isActive) e.currentTarget.play().catch(()=>{}); }}
                />

                {/* Ліворуч зверху — текст сценарію */}
                {(st.title || st.description) && (
                  <div className="bmb-caption">
                    {st.title && <div className="bmb-caption-title">{st.title}</div>}
                    {st.description && <div className="bmb-caption-text">{st.description}</div>}
                  </div>
                )}

                {/* Праворуч зверху — Поділитись */}
                <button
                  className="bmb-share"
                  title="Поділитись"
                  onClick={() => handleShare(srcOf(b), st.title)}
                >
                  <i className="fa-solid fa-share-nodes"></i>
                </button>

                {/* Ліворуч знизу — аватар автора */}
                <div className="bmb-author" onClick={() => goToAuthor(b.author_id)} title="Відкрити профіль">
                  {b.author_avatar_url ? (
                    <img src={b.author_avatar_url} alt="author"
                         onError={(e)=>((e.currentTarget as HTMLImageElement).style.display='none')} />
                  ) : (
                    <div className="bmb-author-fallback">{(b.author_id || 'U').slice(0,1).toUpperCase()}</div>
                  )}
                </div>

                {/* Праворуч знизу — звук для цього відео */}
                <button
                  className="bmb-sound"
                  title={muted ? 'Увімкнути звук' : 'Вимкнути звук'}
                  onClick={() => onToggleMute(b.id)}
                >
                  <i className={`fa-solid ${muted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
                </button>
              </div>

              {/* Голосування — лише коли є спір */}
              {!!dispId && (
                <div className="bmb-vote">
                  <DisputeVoteWidget disputeId={String(dispId)} />
                </div>
              )}
            </div>
          </section>
        );
      })}

      {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
    </div>
  );
}
