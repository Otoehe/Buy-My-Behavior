'use client';

/**
 * Behaviors Feed — YouTube Shorts style (clean)
 * ▸ Вертикальні картки 9:16, по одній на екран (scroll‑snap + smooth)
 * ▸ Автоплей лише активної картки; мʼют за замовчуванням (політика браузера)
 * ▸ Тягнемо відео з таблиці `behaviors`; якщо запис — evidence у спорі, показуємо кнопки голосування
 * ▸ Без правої «соціальної» рейки
 * ▸ NEW: клік по аватару відкриває шторку профілю; свайп/колесо — переходить рівно між картками і ПЕТЛЕЮ по колу
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

// ========= Canvas REST config (для LIVE у канві — опційно) =========
// @ts-ignore
const SUPABASE_URL: string = (typeof process !== 'undefined' && (process.env as any)?.NEXT_PUBLIC_SUPABASE_URL) || '';
// @ts-ignore
const SUPABASE_ANON_KEY: string = (typeof process !== 'undefined' && (process.env as any)?.NEXT_PUBLIC_SUPABASE_ANON_KEY) || '';
const hasLiveCreds = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
async function restGet(pathAndQuery: string) {
  const res = await fetch(`${SUPABASE_URL}${pathAndQuery}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${pathAndQuery}`);
  return res.json();
}

// ============================== Types ===============================
export type VoteChoice = 'performer' | 'customer';
export type BehaviorItem = {
  id: number | string;
  title?: string | null;
  description?: string | null;
  authorId?: string | null;
  authorAvatarUrl?: string | null;
  mediaUrl?: string | null;
  posterUrl?: string | null;
  createdAt?: string | null;
  isEvidence?: boolean; // behaviors.is_dispute_evidence
  disputeId?: string | null;
  disputeStatus?: 'open' | 'closed' | 'resolved' | null;
  disputeStats?: { performer: number; customer: number } | null;
  myVote?: VoteChoice | null;
};

export type BehaviorsFeedProps = {
  items: BehaviorItem[];
  onShare?: (id: BehaviorItem['id']) => void;
  onOpenAuthor?: (authorId: string) => void;
  onViewDispute?: (id: BehaviorItem['id']) => void;
  onVote?: (disputeId: string, choice: VoteChoice) => Promise<void> | void;
};

declare global { interface Window { supabase?: any; __bmb_load_behaviors?: () => Promise<BehaviorItem[]>; openProfileSheet?: (id:string)=>void; router?: { push?: (u:string)=>void } } }

// ========================= Презентаційний фід =========================
export const BehaviorsFeedFullScreen: React.FC<BehaviorsFeedProps> = ({ items, onShare, onOpenAuthor, onViewDispute, onVote }) => {
  const [activeId, setActiveId] = useState<string>(items[0] ? String(items[0].id) : '');
  const [mutedMap, setMutedMap] = useState<Record<string, boolean>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const wrapRefs = useRef<Record<string, HTMLElement | null>>({});
  const isAnimatingRef = useRef(false);
  const wheelAccRef = useRef(0);
  const touchStartY = useRef<number | null>(null);
  const touchDeltaY = useRef(0);

  const idxOfActive = () => items.findIndex((it) => String(it.id) === activeId);
  const goToIndex = (i: number) => {
    if (!items.length) return;
    const size = items.length;
    const safe = ((i % size) + size) % size; // модуль по колу
    const next = items[safe];
    const el = wrapRefs.current[String(next.id)];
    if (el) {
      isAnimatingRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => { isAnimatingRef.current = false; }, 450);
    }
  };
  const goNext = () => goToIndex(idxOfActive() + 1);
  const goPrev = () => goToIndex(idxOfActive() - 1);

  // Визначення активної картки
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((ent) => {
        const id = (ent.target as HTMLElement).dataset.id!;
        if (ent.isIntersecting && ent.intersectionRatio >= 0.6) setActiveId(id);
      });
    }, { threshold: [0.6] });
    Object.values(wrapRefs.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  // Автоплей тільки активного відео
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, v]) => {
      if (!v) return;
      const play = id === activeId;
      v.muted = mutedMap[id] ?? true;
      if (play) { v.play().catch(() => {}); } else { v.pause(); }
    });
  }, [activeId, mutedMap]);

  // Плавна навігація клавішами ↑/↓ (по колу)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowDown','PageDown','ArrowUp','PageUp'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'ArrowDown' || e.key === 'PageDown') goNext(); else goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, items]);

  // Скрол/свайп — по одному елементу і по колу
  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (isAnimatingRef.current) return;
    e.preventDefault();
    wheelAccRef.current += e.deltaY;
    const TH = 60; // поріг чутливості
    if (Math.abs(wheelAccRef.current) > TH) {
      wheelAccRef.current > 0 ? goNext() : goPrev();
      wheelAccRef.current = 0;
    }
  };
  const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => { touchStartY.current = e.touches[0].clientY; touchDeltaY.current = 0; };
  const onTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => { if (touchStartY.current!=null) touchDeltaY.current = e.touches[0].clientY - touchStartY.current; };
  const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    const TH = 40;
    if (Math.abs(touchDeltaY.current) > TH) {
      touchDeltaY.current < 0 ? goNext() : goPrev();
    } else {
      const curr = wrapRefs.current[activeId];
      curr?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    touchStartY.current = null; touchDeltaY.current = 0;
  };

  // ===== Styles =====
  const container: React.CSSProperties = {
    minHeight: '100vh',
    overflowY: 'auto',
    background: '#fff',
    padding: '16px 0 32px',
    scrollSnapType: 'y mandatory',
    scrollBehavior: 'smooth',
    overscrollBehavior: 'contain',
    touchAction: 'manipulation',
  };
  const rowWrap: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px 0',
    scrollSnapAlign: 'center',
    scrollSnapStop: 'always',
  };
  const card: React.CSSProperties = {
    position: 'relative',
    width: 'min(420px, 92vw)',
    aspectRatio: '9 / 16',
    height: 'auto',
    borderRadius: 20,
    overflow: 'hidden',
    border: '1px solid rgba(17,17,17,.12)',
    boxShadow: '0 14px 32px rgba(17,17,17,.14)',
    background: '#fff'
  };
  const media: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' };
  const caption: React.CSSProperties = {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 48,
    padding: '8px 10px',
    borderRadius: 12,
    background: 'rgba(17,17,17,.5)',
    color: '#fff',
    fontSize: 13,
    lineHeight: 1.2,
    textShadow: '0 1px 2px rgba(0,0,0,.6)'
  };
  const chip: React.CSSProperties = {
    position: 'absolute',
    top: 10,
    left: 12,
    transform: 'none',
    background: 'rgba(17,17,17,.55)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,.15)',
    borderRadius: 10,
    padding: '6px 10px',
    fontWeight: 700,
    boxShadow: '0 4px 14px rgba(0,0,0,.15)'
  };
  const avatar: React.CSSProperties = { position: 'absolute', left: 10, bottom: 70, width: 56, height: 56, borderRadius: '50%', border: '2px solid #fff', overflow: 'hidden', boxShadow: '0 6px 20px rgba(0,0,0,.18)', cursor: 'pointer' };
  const soundBtn: React.CSSProperties = { position: 'absolute', right: 70, bottom: 70, width: 44, height: 44, borderRadius: 999, border: '1px solid rgba(17,17,17,.2)', background: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, cursor: 'pointer' };
  const moreBtn: React.CSSProperties = { position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 999, background: '#fff', border: '1px solid rgba(17,17,17,.12)', display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.12)', cursor: 'pointer' };
  const actions: React.CSSProperties = { position: 'absolute', left: 10, right: 10, bottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
  const btn: React.CSSProperties = { borderRadius: 999, padding: '10px 12px', fontWeight: 800, border: 'none', cursor: 'pointer' };

  return (
    <div
      style={container}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {items.map((it) => {
        const id = String(it.id);
        const muted = mutedMap[id] ?? true;
        const hasDispute = !!it.disputeId;
        const perf = it.disputeStats?.performer ?? 0;
        const cust = it.disputeStats?.customer ?? 0;
        return (
          <section key={id} style={rowWrap}>
            <div data-id={id} ref={(el) => (wrapRefs.current[id] = el)} style={card}>
              {it.mediaUrl ? (
                <video
                  ref={(v)=> (videoRefs.current[id]=v)}
                  src={it.mediaUrl || undefined}
                  poster={it.posterUrl || undefined}
                  style={media}
                  playsInline
                  muted
                  loop
                  preload="metadata"
                  autoPlay
                />
              ) : (
                <div style={media} />
              )}

              {(it.title || it.description) && (
                <div style={caption}>
                  {it.title && <div style={{ fontWeight: 800, marginBottom: 4 }}>{it.title}</div>}
                  {it.description && <div style={{ opacity: .95 }}>{it.description}</div>}
                </div>
              )}

              {it.isEvidence && (
                <div style={chip}>🎥 Video evidence<br/><span style={{opacity:.9,fontWeight:600,fontSize:12}}>Завантажено з StoryBar</span></div>
              )}

              <button style={moreBtn} title="меню">⋯</button>

              {it.authorAvatarUrl && (
                <div
                  style={avatar}
                  onClick={()=>{
                    try{
                      if (it.authorId) {
                        if (window.openProfileSheet) window.openProfileSheet(it.authorId);
                        else if (window.router?.push) window.router.push(`/map?profile=${it.authorId}`);
                        else window.location.href = `/map?profile=${it.authorId}`;
                        onOpenAuthor?.(it.authorId);
                      }
                    }catch{ /* noop */ }
                  }}
                  title="Профіль автора"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.authorAvatarUrl} alt="author" style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={(e)=>((e.currentTarget as HTMLImageElement).style.display='none')} />
                </div>
              )}

              {it.mediaUrl && (
                <button style={soundBtn} aria-label={muted?'Увімкнути звук':'Вимкнути звук'} onClick={()=> setMutedMap((p)=> ({...p,[id]: !muted}))}>{muted?'🔇':'🔊'}</button>
              )}

              <div style={actions}>
                {hasDispute ? (
                  <>
                    <button style={{...btn, background:'#111', color:'#fff'}} onClick={async()=>{ try { await onVote?.(it.disputeId!, 'performer'); } catch { /* noop */ } }}>підтримати виконавця ({perf})</button>
                    <button style={{...btn, background:'#9ca3af', color:'#fff'}} onClick={async()=>{ try { await onVote?.(it.disputeId!, 'customer'); } catch { /* noop */ } }}>підтримати замовника ({cust})</button>
                  </>
                ) : (
                  <>
                    <button style={{...btn, background:'#e5e7eb'}} onClick={()=>{ try { if (it.authorId) onOpenAuthor?.(it.authorId); } catch { /* noop */ } }}>профіль автора</button>
                    <button style={{...btn, background:'#e5e7eb'}} onClick={()=>{ try { onShare?.(it.id); } catch { /* noop */ } }}>поділитись</button>
                  </>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};

// ============================ LIVE через REST (канва) ============================
export function BehaviorsFeedLiveFromSupabase() {
  const [items, setItems] = useState<BehaviorItem[]>([]);
  const [err, setErr] = useState<string|null>(null);

  useEffect(() => { let alive = true; (async()=>{
    try {
      if (!hasLiveCreds) throw new Error('Додай SUPABASE_URL/KEY у верхній частині файлу');
      const select = 'id,ipfs_cid,file_url,thumbnail_url,title,description,created_at,dispute_id,author_id,is_dispute_evidence,profiles:author_id(id,avatar_url)';
      const rows = await restGet(`/rest/v1/behaviors?select=${encodeURIComponent(select)}&order=created_at.desc&limit=100`);
      const base: BehaviorItem[] = (rows||[]).map((b:any)=>(
        {
          id:b.id, title:b.title, description:b.description, authorId:b.author_id??null,
          authorAvatarUrl:b?.profiles?.avatar_url??null,
          mediaUrl: b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url??null),
          posterUrl:b.thumbnail_url??null, createdAt:b.created_at??null,
          isEvidence: !!b.is_dispute_evidence, disputeId:b.dispute_id??null,
        }
      ));
      const dispIds = Array.from(new Set(base.map(x=>x.disputeId).filter(Boolean))) as string[];
      let statusMap:any = {}, countsMap:any = {};
      if (dispIds.length) {
        const ds = await restGet(`/rest/v1/disputes?select=id,status&in.id=(${encodeURIComponent(dispIds.join(','))})`);
        (ds||[]).forEach((d:any)=> statusMap[d.id]=d.status);
        const cnt = await restGet(`/rest/v1/dispute_vote_counts?select=dispute_id,performer_votes,customer_votes&in.dispute_id=(${encodeURIComponent(dispIds.join(','))})`);
        (cnt||[]).forEach((c:any)=> countsMap[c.dispute_id]={ performer:c.performer_votes||0, customer:c.customer_votes||0 });
      }
      const mapped = base.map((r)=>({ ...r, disputeStatus: statusMap[r.disputeId||'']??null, disputeStats: countsMap[r.disputeId||'']??null }));
      if (alive) setItems(mapped);
    } catch(e:any) { if (alive) setErr(e.message||'load error'); }
  })(); return ()=>{alive=false}; }, []);

  if (!hasLiveCreds) return <div style={{padding:16}}>Додай <code>SUPABASE_URL</code> і <code>SUPABASE_ANON_KEY</code> для LIVE у канві.</div>;
  if (err) return <div style={{padding:16,color:'#b91c1c'}}>Помилка: {err}</div>;
  return <BehaviorsFeedFullScreen items={items} onShare={(id)=>{ try{navigator.share?.({title:'Buy My Behavior', url: location.href});}catch{ /* noop */ } }} />;
}

// ============================== Preview (демо) =============================
export function BehaviorsFeedPreview(){
  const demo:BehaviorItem[] = [
    { id:101, title:'Video evidence', description:'Завантажено з StoryBar', mediaUrl:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', isEvidence:true, disputeId:'demo1', disputeStatus:'open', disputeStats:{ performer:12, customer:8 }, authorId:'u1', authorAvatarUrl:'https://i.pravatar.cc/100?img=12' },
    { id:102, title:'Класичний біхейворс', description:'Без спору', mediaUrl:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', isEvidence:false, authorId:'u2', authorAvatarUrl:'https://i.pravatar.cc/100?img=32' },
  ];
  return <BehaviorsFeedFullScreen items={demo}/>;
}

// ============================ Default export ============================
export default function BehaviorsFeedEntry({ supabase: supabaseClient, loader }: { supabase?: any; loader?: () => Promise<BehaviorItem[]> } = {}){
  const sb = supabaseClient || (typeof window !== 'undefined' ? (window as any).supabase : undefined);
  if (hasLiveCreds && !sb && !loader) return <BehaviorsFeedLiveFromSupabase/>;
  if (sb || loader) return <BehaviorsFeedProd supabase={sb} loader={loader}/>;
  return <BehaviorsFeedPreview/>;
}

// =============================== PROD Loader ===============================
export function BehaviorsFeedProd({ loader, supabase: sbFromProp }: { loader?: () => Promise<BehaviorItem[]>; supabase?: any } = {}){
  const [items,setItems] = useState<BehaviorItem[]>([]);
  const sb = useMemo(()=> sbFromProp || (typeof window!=='undefined' ? (window as any).supabase : undefined), [sbFromProp]);

  useEffect(()=>{ let alive=true; (async()=>{
    try{
      let list:BehaviorItem[]|null=null;
      if (typeof loader==='function') {
        list = await loader();
      } else if (typeof window!=='undefined' && typeof window.__bmb_load_behaviors==='function') {
        list = await window.__bmb_load_behaviors();
      } else if (sb && sb.from){
        const { data, error } = await sb.from('behaviors').select(`
          id, ipfs_cid, file_url, thumbnail_url, title, description, created_at,
          dispute_id, author_id, is_dispute_evidence,
          profiles:author_id(id, avatar_url)
        `).order('created_at',{ascending:false}).limit(100);
        if (error) throw error;
        const base:BehaviorItem[] = (data||[]).map((b:any)=>(
          {
            id:b.id, title:b.title, description:b.description, authorId:b.author_id??null,
            authorAvatarUrl:b?.profiles?.avatar_url??null,
            mediaUrl: b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url??null),
            posterUrl:b.thumbnail_url??null, createdAt:b.created_at??null,
            isEvidence: !!b.is_dispute_evidence, disputeId:b.dispute_id??null,
          }
        ));
        const dispIds = Array.from(new Set(base.map(x=>x.disputeId).filter(Boolean))) as string[];
        let statusMap:any={}, countsMap:any={}, myMap:any={};
        if (dispIds.length){
          const { data: ds, error: e1 } = await sb.from('disputes').select('id,status').in('id', dispIds);
          if (e1) throw e1; (ds||[]).forEach((d:any)=> statusMap[d.id]=d.status);
          const { data: cnt, error: e2 } = await sb.from('dispute_vote_counts').select('dispute_id, performer_votes, customer_votes').in('dispute_id', dispIds);
          if (e2) throw e2; (cnt||[]).forEach((c:any)=> countsMap[c.dispute_id]={ performer:c.performer_votes||0, customer:c.customer_votes||0 });
          const { data: auth } = await sb.auth.getUser();
          const uid = auth?.user?.id as string|undefined;
          if (uid){
            const { data: my, error: e3 } = await sb.from('dispute_votes').select('dispute_id, choice').in('dispute_id', dispIds).eq('user_id', uid);
            if (!e3) (my||[]).forEach((m:any)=>{ myMap[m.dispute_id]=m.choice as VoteChoice; });
          }
        }
        list = base.map((r)=>({ ...r, disputeStatus: statusMap[r.disputeId||'']??null, disputeStats: countsMap[r.disputeId||'']??null, myVote: myMap[r.disputeId||'']??null }));
      } else if (hasLiveCreds) {
        const select = 'id,ipfs_cid,file_url,thumbnail_url,title,description,created_at,dispute_id,author_id,is_dispute_evidence,profiles:author_id(id,avatar_url)';
        const rows = await restGet(`/rest/v1/behaviors?select=${encodeURIComponent(select)}&order=created_at.desc&limit=100`);
        const base: BehaviorItem[] = (rows||[]).map((b:any)=>(
          {
            id:b.id, title:b.title, description:b.description, authorId:b.author_id??null,
            authorAvatarUrl:b?.profiles?.avatar_url??null,
            mediaUrl: b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url??null),
            posterUrl:b.thumbnail_url??null, createdAt:b.created_at??null,
            isEvidence: !!b.is_dispute_evidence, disputeId:b.dispute_id??null,
          }
        ));
        const dispIds = Array.from(new Set(base.map(x=>x.disputeId).filter(Boolean))) as string[];
        let statusMap:any={}, countsMap:any={};
        if (dispIds.length){
          const ds = await restGet(`/rest/v1/disputes?select=id,status&in.id=(${encodeURIComponent(dispIds.join(','))})`);
          (ds||[]).forEach((d:any)=> statusMap[d.id]=d.status);
          const cnt = await restGet(`/rest/v1/dispute_vote_counts?select=dispute_id,performer_votes,customer_votes&in.dispute_id=(${encodeURIComponent(dispIds.join(','))})`);
          (cnt||[]).forEach((c:any)=> countsMap[c.dispute_id]={ performer:c.performer_votes||0, customer:c.customer_votes||0 });
        }
        list = base.map((r)=>({ ...r, disputeStatus: statusMap[r.disputeId||'']??null, disputeStats: countsMap[r.disputeId||'']??null }));
      } else {
        list = [];
      }
      if (alive) setItems(list||[]);
    }catch(e){
      console.error('BehaviorsFeedProd load:', e);
      if(alive) setItems([]);
    }
  })(); return ()=>{alive=false}; }, [loader, sb]);

  const cast = async (disputeId:string, choice:VoteChoice)=>{
    try{
      if (!sb) { alert('Голосування доступне після входу в застосунок'); return; }
      const { data: auth } = await sb.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid){ alert('Увійдіть, щоб голосувати'); return; }
      const { error } = await sb.from('dispute_votes').upsert({ dispute_id: disputeId, user_id: uid, choice }, { onConflict: 'dispute_id,user_id' });
      if (error){ alert(error.message); return; }
      const { data: cnt } = await sb.from('dispute_vote_counts').select('dispute_id, performer_votes, customer_votes').eq('dispute_id', disputeId).maybeSingle();
      setItems((prev)=> prev.map((it)=> it.disputeId===disputeId ? ({ ...it, myVote: choice, disputeStats: { performer: cnt?.performer_votes||0, customer: cnt?.customer_votes||0 }}) : it));
    }catch(err){ console.error('vote error', err); }
  };

  return (
    <BehaviorsFeedFullScreen
      items={items}
      onVote={cast}
      onOpenAuthor={(aid)=>{ try{ if(aid){ if (window.openProfileSheet) window.openProfileSheet(aid); else if (window.router?.push) window.router.push(`/map?profile=${aid}`); else window.location.href=`/map?profile=${aid}`; } }catch{ /* noop */ } }}
      onViewDispute={(id)=>{ try{ window.location.href=`/disputes/${id}` }catch{ /* noop */ } }}
      onShare={()=>{ try{navigator.share?.({title:'Buy My Behavior', url: location.href});}catch{ /* noop */ } }}
    />
  );
}
