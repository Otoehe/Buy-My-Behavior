'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Behaviors Feed — pulls rows from public.behaviors just like user's app code:
 *  - SELECT `*, profiles:author_id(avatar_url)`
 *  - ORDER BY created_at DESC
 *  - Video src: ipfs_cid -> lighthouse gateway, else file_url
 *  - Avatar (circle) opens owner profile sheet and routes to /map with {profile}
 *  - Vertical 9:16 cards, one-per-view, smooth swipe + wheel snapping
 *
 * NOTE (Canvas): ми не імпортуємо ../lib/supabase, а читаємо window.supabase.
 * У проді заміни getSupabase() на свій імпорт клієнта Supabase.
 */

// =============================== Types ===============================
export type Behavior = {
  id: number;
  ipfs_cid: string | null;
  file_url?: string | null;
  thumbnail_url?: string | null;
  title?: string | null;
  description?: string | null;
  created_at?: string | null;
  author_id?: string | null;
  author_avatar_url?: string | null;
  likes_count?: number;
  dislikes_count?: number;
  is_dispute_evidence?: boolean;
  dispute_id?: string | null;
};

type ScenarioText = { title?: string; description?: string };

declare global {
  interface Window {
    supabase?: any;
    openProfileSheet?: (id: string) => void;
    router?: { push?: (u: string, opts?: any) => void };
    bmb_refreshFeed?: () => Promise<void> | void;
    // REST creds for Canvas (fallback when window.supabase is absent)
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    bmb_setRestCreds?: (url: string, key: string) => void;
  }
}

// ============================== Styles ===============================
const page: React.CSSProperties = { display: 'grid', placeItems: 'start center', paddingTop: 8 };
const container: React.CSSProperties = {
  width: '100%',
  maxWidth: 460,
  height: 'calc(100vh - 64px)',
  margin: '0 auto',
  overflowY: 'auto',
  scrollSnapType: 'y mandatory',
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none' as any,
};
const itemWrap: React.CSSProperties = {
  height: 'calc(100vh - 64px)',
  display: 'grid',
  placeItems: 'center',
  scrollSnapAlign: 'start',
};
const card: React.CSSProperties = {
  width: 'min(388px, 92vw)',
  aspectRatio: '9 / 16',
  background: '#000',
  borderRadius: 18,
  overflow: 'hidden',
  position: 'relative',
  boxShadow: '0 12px 36px rgba(0,0,0,.3)'
};
const captionTop: React.CSSProperties = {
  position: 'absolute', left: 12, right: 12, top: 56,
  background: 'rgba(0,0,0,.35)', color: '#fff',
  borderRadius: 10, padding: '6px 10px', fontSize: 12,
};
const storyBadge: React.CSSProperties = {
  position: 'absolute', left: 12, right: 12, top: 10,
  background: 'linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.25))',
  color: '#fff', borderRadius: 12, padding: '8px 10px',
  fontSize: 12, lineHeight: 1.25, textShadow: '0 1px 2px rgba(0,0,0,.6)'
};
const avatarBtn: React.CSSProperties = {
  position: 'absolute', left: 16, bottom: 16,
  width: 48, height: 48, borderRadius: 999,
  border: '2px solid rgba(255,255,255,.9)',
  overflow: 'hidden', display: 'grid', placeItems: 'center',
  boxShadow: '0 4px 14px rgba(0,0,0,.35)', background: '#111', color: '#fff',
  cursor: 'pointer',
};
const soundBtn: React.CSSProperties = {
  position: 'absolute', right: 16, bottom: 16,
  width: 44, height: 44, borderRadius: 999,
  border: '1px solid rgba(17,17,17,.2)', background: '#fff',
  display: 'grid', placeItems: 'center', fontWeight: 900, cursor: 'pointer'
};

function videoSrcOf(b: Behavior) {
  if (b?.ipfs_cid) return `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}`;
  if (b?.file_url) return b.file_url;
  return '';
}

function getSupabase() {
  return typeof window !== 'undefined' ? window.supabase : null;
}

// ====== REST fallback (Canvas / no SDK) ======
function getRestCreds(){
  const url = (typeof process!=='undefined' && (process.env as any)?.NEXT_PUBLIC_SUPABASE_URL) || (typeof window!=='undefined' ? (window.SUPABASE_URL||'') : '') || '';
  const key = (typeof process!=='undefined' && (process.env as any)?.NEXT_PUBLIC_SUPABASE_ANON_KEY) || (typeof window!=='undefined' ? (window.SUPABASE_ANON_KEY||'') : '') || '';
  return { url, key, ok: !!url && !!key } as const;
}
async function restGet(pathAndQuery: string) {
  const { url, key, ok } = getRestCreds();
  if (!ok) throw new Error('REST creds missing');
  const res = await fetch(`${url}${pathAndQuery}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`REST ${res.status}: ${pathAndQuery}`);
  return res.json();
}
if (typeof window !== 'undefined') {
  window.bmb_setRestCreds = (u: string, k: string) => {
    window.SUPABASE_URL = u; window.SUPABASE_ANON_KEY = k;
    try { window.bmb_refreshFeed?.(); } catch {}
    location.reload();
  };
}

// =============================== Component ===============================
export default function BehaviorsFeedSupabasePath() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [scenarioTextByBehavior, setScenarioTextByBehavior] = useState<Record<number, ScenarioText>>({});
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const wrapRefs = useRef<Record<number, HTMLElement | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wheelAccRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const touchStartY = useRef<number | null>(null);
  const touchDeltaY = useRef(0);

  const fetchBehaviors = useCallback(async () => {
    // 1) Спроба через SDK
    const sb = getSupabase();
    try {
      if (sb) {
        const { data, error } = await sb
          .from('behaviors')
          .select(`*, profiles:author_id(avatar_url)`)
          .not('file_url','is',null)
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false });
        if (error) throw error;
        const processed: Behavior[] = (data || [])
          .filter((b: any) => b?.file_url || b?.ipfs_cid)
          .map((b: any) => ({
            ...b,
            author_avatar_url: b?.profiles?.avatar_url || '',
            likes_count: b?.likes_count || 0,
            dislikes_count: b?.dislikes_count || 0,
          }));
        const stMap: Record<number, ScenarioText> = {};
        processed.forEach((b) => { stMap[b.id] = { title: b.title || undefined, description: b.description || undefined }; });
        setScenarioTextByBehavior(stMap);
        setBehaviors(processed);
        if (processed.length) return; // success
      }
    } catch (e) {
      console.warn('SDK load failed, fallback to REST:', e);
    }

    // 2) Фолбек через REST (PostgREST)
    try {
      const { ok } = getRestCreds();
      if (!ok) { setBehaviors([]); return; }
      const q = `/rest/v1/behaviors?select=*,profiles:author_id(avatar_url)&file_url=is.not.null&order=created_at.desc.nullslast,id.desc&limit=100`;
      const rows: any[] = await restGet(q);
      const processed: Behavior[] = (rows || [])
        .filter((b: any) => b?.file_url || b?.ipfs_cid)
        .map((b: any) => ({
          ...b,
          author_avatar_url: b?.profiles?.avatar_url || '',
          likes_count: b?.likes_count || 0,
          dislikes_count: b?.dislikes_count || 0,
        }));
      const stMap: Record<number, ScenarioText> = {};
      processed.forEach((b) => { stMap[b.id] = { title: b.title || undefined, description: b.description || undefined }; });
      setScenarioTextByBehavior(stMap);
      setBehaviors(processed);
    } catch (e) {
      console.error('REST load error:', e);
      setBehaviors([]);
    }
  }, []);

  useEffect(() => { window.bmb_refreshFeed = fetchBehaviors; fetchBehaviors(); }, [fetchBehaviors]);

// realtime: підтягуємо нові/оновлені записи без перезавантаження
useEffect(() => {
  const sb = getSupabase();
  if (!sb) return;
  const ch = sb
    .channel('bmb_behaviors_feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'behaviors' }, () => {
      // перезавантажити список — простіше й стабільніше, ніж ручне злиття
      fetchBehaviors();
    })
    .subscribe();
  return () => { try { sb.removeChannel(ch); } catch {} };
}, [fetchBehaviors]);

  // ---------- auto play/pause by intersection ----------
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
    Object.entries(videoRefs.current).forEach(([idStr, v]) => {
      const id = idStr; // dataset.id is string
      if (!v) return;
      if (id === activeVideoId) { v.muted = false; v.play().catch(() => {}); }
      else { v.pause(); v.muted = true; }
    });
  }, [activeVideoId]);

  // ---------- smooth one-by-one scroll/swipe ----------
  const goToIndex = (idx: number) => {
    const n = behaviors.length;
    if (!n) return;
    const safe = ((idx % n) + n) % n;
    const id = behaviors[safe]?.id;
    const el = wrapRefs.current[id];
    if (el) {
      isAnimatingRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { isAnimatingRef.current = false; }, 360);
    }
  };
  const currIndex = useMemo(() => behaviors.findIndex(i => String(i.id) === activeVideoId), [behaviors, activeVideoId]);
  const goNext = () => goToIndex(currIndex + 1);
  const goPrev = () => goToIndex(currIndex - 1);

  const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => { touchStartY.current = e.touches[0].clientY; touchDeltaY.current = 0; };
  const onTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => { if (touchStartY.current != null) touchDeltaY.current = e.touches[0].clientY - touchStartY.current; };
  const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    const TH = 40;
    if (Math.abs(touchDeltaY.current) > TH) (touchDeltaY.current < 0 ? goNext() : goPrev());
    else {
      const id = behaviors[currIndex]?.id; wrapRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    touchStartY.current = null; touchDeltaY.current = 0;
  };

  // wheel (non‑passive) to enable preventDefault-based snapping
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (isAnimatingRef.current) return;
      ev.preventDefault();
      wheelAccRef.current += ev.deltaY;
      const TH = 60;
      if (Math.abs(wheelAccRef.current) > TH) {
        wheelAccRef.current > 0 ? goNext() : goPrev();
        wheelAccRef.current = 0;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel as any);
  }, [behaviors.length, currIndex]);

  const onOpenAuthor = (authorId?: string | null) => {
    if (!authorId) return;
    // 1) open sheet (your app should provide window.openProfileSheet)
    window.openProfileSheet?.(authorId);
    // 2) route to /map with profile in state (react-router like)
    try { window.router?.push?.('/map', { state: { profile: authorId } }); } catch {}
    // fallback: query param for Next/other routers
    try { window.router?.push?.(`/map?profile=${encodeURIComponent(authorId)}`); } catch {}
  };

  const empty = behaviors.length === 0;

  return (
    <div style={page}>
      <div
        ref={containerRef}
        style={container}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {empty && (
          // Якщо порожньо, у Canvas підкажемо як увімкнути REST без SDK:
          <section style={itemWrap} data-id="0">
            <div style={card}>
              <div style={captionTop}>Немає відео для показу</div>
              <div style={{color:'#fff',display:'grid',placeItems:'center',width:'100%',height:'100%',textAlign:'center',padding:16}}>
                Додайте біхевіор через ваш сторібар. Стрічка підтягне його автоматично.
                <div style={{marginTop:12, opacity:.85, fontSize:12}}>Canvas fallback: у консолі виконайте <code>bmb_setRestCreds('https://YOUR.supabase.co','YOUR_ANON_KEY')</code> і перезавантажте.</div>
              </div>
            </div>
          </section>
        )}

        {behaviors.map((b) => {
          const src = videoSrcOf(b);
          return (
            <section key={b.id} style={itemWrap} ref={(el) => (wrapRefs.current[b.id] = el)} data-id={String(b.id)}>
              <div style={card}>
                {/* верхній бейдж як у вашому макеті */}
                <div style={storyBadge}>
                  <div style={{ fontWeight: 700 }}>Video evidence</div>
                  <div style={{ opacity: .95 }}>Завантажено з StoryBar</div>
                </div>
                {(b.title || b.description) && (
                  <div style={captionTop}>
                    {b.title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{b.title}</div>}
                    {b.description && <div style={{ opacity: .95 }}>{b.description}</div>}
                  </div>
                )}

                {src ? (
                  <video
                    ref={(el) => (videoRefs.current[b.id] = el)}
                    src={src}
                    poster={b.thumbnail_url || undefined}
                    className="shorts-video"
                    playsInline muted autoPlay loop preload="metadata"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    data-id={String(b.id)}
                    onLoadedMetadata={(e) => { if (String(b.id) === activeVideoId) e.currentTarget.play().catch(() => {}); }}
                  />
                ) : (
                  <div style={{ color: '#fff', display: 'grid', placeItems: 'center', width: '100%', height: '100%' }}>No video</div>
                )}

                <button title="Власник" style={avatarBtn} onClick={() => onOpenAuthor(b.author_id || undefined)}>
                  {b.author_avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.author_avatar_url} alt="owner" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                         onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
                  ) : (
                    <span>{(b.author_id || 'U').slice(0, 1).toUpperCase()}</span>
                  )}
                </button>

                <button title={'Звук'} style={soundBtn} onClick={() => {
                  const el = videoRefs.current[b.id];
                  if (!el) return;
                  el.muted = !el.muted;
                }}>
                  🔊
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
