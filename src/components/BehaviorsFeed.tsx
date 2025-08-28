'use client';

/**
 * Behaviors Feed — YouTube Shorts style
 * ▸ Центровані вертикальні картки 9:16, автоплей тільки активної
 * ▸ Показує відео з таблиці behaviors: як звичайні, так і `is_dispute_evidence = true`
 * ▸ Якщо запис є відео‑доказом і прив'язаний до спору — показує кнопки голосування
 * ▸ Без абсолютних імпортів, щоб збірка у Canvas не падала. У проді використовуйте
 *   <BehaviorsFeedProd supabase={supabase}> або передайте `loader()`.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

// ========= Canvas REST config (для LIVE у канві — опційно) =========
const SUPABASE_URL = '' as string; // напр.: 'https://xyz.supabase.co'
const SUPABASE_ANON_KEY = '' as string; // напр.: 'eyJhbGciOi...'
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
  // dispute meta
  disputeId?: string | null;
  disputeStatus?: 'open' | 'closed' | 'resolved' | null;
  disputeStats?: { performer: number; customer: number } | null;
  myVote?: VoteChoice | null;
  // соціальні лічильники (для правої рейки)
  social?: { likes?: number; dislikes?: number; comments?: number; shares?: number; views?: number } | null;
};

export type BehaviorsFeedProps = {
  items: BehaviorItem[];
  onShare?: (id: BehaviorItem['id']) => void;
  onOpenAuthor?: (authorId: string) => void;
  onViewDispute?: (id: BehaviorItem['id']) => void;
  onVote?: (disputeId: string, choice: VoteChoice) => Promise<void> | void;
};

declare global { interface Window { supabase?: any; __bmb_load_behaviors?: () => Promise<BehaviorItem[]> } }

// ========================= Презентаційний фід =========================
export const BehaviorsFeedFullScreen: React.FC<BehaviorsFeedProps> = ({ items, onShare, onOpenAuthor, onViewDispute, onVote }) => {
  const [activeId, setActiveId] = useState<string>(items[0] ? String(items[0].id) : '');
  const [mutedMap, setMutedMap] = useState<Record<string, boolean>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const wrapRefs = useRef<Record<string, HTMLElement | null>>({});

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

  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, v]) => {
      if (!v) return;
      const play = id === activeId;
      v.muted = mutedMap[id] ?? true;
      play ? v.play().catch(() => {}) : v.pause();
    });
  }, [activeId, mutedMap]);

  const container: React.CSSProperties = { minHeight: '100vh', overflowY: 'auto', background: '#f8f5f6', padding: '16px 0 32px' };
  const rowWrap: React.CSSProperties = { display: 'flex', justifyContent: 'center', padding: '28px 0' };
  const card: React.CSSProperties = { position: 'relative', width: 'min(480px, 92vw)', height: 'min(86vh, 760px)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 18px 40px rgba(17,17,17,.18)', background: '#fff' };
  const media: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' };
  const caption: React.CSSProperties = { position: 'absolute', top: 10, left: 10, right: 56, padding: '10px 12px', borderRadius: 12, background: 'linear-gradient(180deg,rgba(0,0,0,.6),rgba(0,0,0,.2))', color: '#fff', fontSize: 14, lineHeight: 1.25, textShadow: '0 1px 2px rgba(0,0,0,.6)' };
  const chip: React.CSSProperties = { position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #eee', borderRadius: 999, padding: '6px 10px', fontWeight: 800, boxShadow: '0 4px 16px rgba(0,0,0,.08)' };
  const railWrap: React.CSSProperties = { position: 'absolute', right: 6, top: 60, bottom: 70, width: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, pointerEvents: 'none' };
  const railItem: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'auto' };
  const railBtn: React.CSSProperties = { width: 48, height: 48, borderRadius: 999, background: '#fff', border: '1px solid rgba(17,17,17,.08)', display: 'grid', placeItems: 'center', boxShadow: '0 6px 20px rgba(0,0,0,.18)', cursor: 'pointer', fontSize: 18 };
  const railCount: React.CSSProperties = { fontSize: 12, color: '#111', fontWeight: 700 };
  const avatar: React.CSSProperties = { position: 'absolute', left: 10, bottom: 70, width: 56, height: 56, borderRadius: '50%', border: '2px solid #fff', overflow: 'hidden', boxShadow: '0 6px 20px rgba(0,0,0,.18)', cursor: 'pointer' };
  const soundBtn: React.CSSProperties = { position: 'absolute', right: 70, bottom: 70, width: 44, height: 44, borderRadius: 999, border: '1px solid rgba(17,17,17,.2)', background: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, cursor: 'pointer' };
  const actions: React.CSSProperties = { position: 'absolute', left: 10, right: 10, bottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
  const btn: React.CSSProperties = { borderRadius: 999, padding: '10px 12px', fontWeight: 800, border: 'none', cursor: 'pointer' };

  // локальні лічильники для правої рейки (демо)
  const [social, setSocial] = useState<Record<string, { likes: number; dislikes: number; comments: number; shares: number; views: number }>>({});
  useEffect(() => {
    const m: any = {};
    items.forEach((it) => { const s = it.social || {}; m[String(it.id)] = { likes: s.likes||0, dislikes: s.dislikes||0, comments: s.comments||0, shares: s.shares||0, views: s.views||0 }; });
    setSocial(m);
  }, [items]);
  const bump = (id: string, k: keyof typeof social[string]) => setSocial((p) => ({ ...p, [id]: { ...p[id], [k]: (p[id]?.[k]||0) + 1 } }));
  const fmtN = (n: number) => (n>=1_000_000?`${(n/1_000_000).toFixed(1)} млн`:n>=1_000?`${(n/1_000).toFixed(1)} тис.`:`${n}`);

  return (
    <div style={container}>
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
                <video ref={(v)=> (videoRefs.current[id]=v)} src={it.mediaUrl||undefined} poster={it.posterUrl||undefined} style={media} playsInline muted loop preload="metadata" autoPlay />
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
                <div style={chip}>🎥 Video evidence</div>
              )}

              {/* права рейка — YouTube‑like */}
              <div style={railWrap}>
                <div style={railItem}><button style={railBtn} title="Меню">⋮</button></div>
                <div style={railItem}><button style={railBtn} onClick={()=>bump(id,'likes')}>👍</button><div style={railCount}>{fmtN(social[id]?.likes||0)}</div></div>
                <div style={railItem}><button style={railBtn} onClick={()=>bump(id,'dislikes')}>👎</button><div style={railCount}>{fmtN(social[id]?.dislikes||0)}</div></div>
                <div style={railItem}><button style={railBtn} onClick={()=>bump(id,'comments')}>💬</button><div style={railCount}>{fmtN(social[id]?.comments||0)}</div></div>
                <div style={railItem}><button style={railBtn} onClick={()=>{ onShare?.(it.id); bump(id,'shares'); }}>↗</button><div style={railCount}>{fmtN(social[id]?.shares||0)}</div></div>
              </div>

              {/* аватар автора */}
              {it.authorAvatarUrl && (
                <div style={avatar} onClick={()=> it.authorId && onOpenAuthor?.(it.authorId)} title="Профіль автора">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.authorAvatarUrl} alt="author" style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={(e)=>((e.currentTarget as HTMLImageElement).style.display='none')} />
                </div>
              )}

              {(it.mediaUrl) && (
                <button style={soundBtn} aria-label={muted?'Увімкнути звук':'Вимкнути звук'} onClick={()=> setMutedMap((p)=> ({...p,[id]: !muted}))}>{muted?'🔇':'🔊'}</button>
              )}

              {/* низ — дії / голосування (видимі тільки якщо є спір) */}
              <div style={actions}>
                {hasDispute ? (
                  <>
                    <button style={{...btn, background:'#111', color:'#fff'}} onClick={()=> onVote?.(it.disputeId!, 'performer')}>підтримати виконавця ({perf})</button>
                    <button style={{...btn, background:'#9ca3af', color:'#fff'}} onClick={()=> onVote?.(it.disputeId!, 'customer')}>підтримати замовника ({cust})</button>
                    {/*
                      За бажанням можна показати <button style={btn} onClick={()=> onViewDispute?.(it.id)}>деталі спору</button>
                    */}
                  </>
                ) : (
                  <>
                    <button style={{...btn, background:'#e5e7eb'}} onClick={()=> onOpenAuthor && it.authorId && onOpenAuthor(it.authorId)}>профіль автора</button>
                    <button style={{...btn, background:'#e5e7eb'}} onClick={()=> onShare?.(it.id)}>поділитись</button>
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
      const base: BehaviorItem[] = (rows||[]).map((b:any)=>({
        id:b.id, title:b.title, description:b.description, authorId:b.author_id??null,
        authorAvatarUrl:b?.profiles?.avatar_url??null,
        mediaUrl: b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url??null),
        posterUrl:b.thumbnail_url??null, createdAt:b.created_at??null,
        isEvidence: !!b.is_dispute_evidence, disputeId:b.dispute_id??null,
      }));
      // dispute status + counts
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
  return <BehaviorsFeedFullScreen items={items} onShare={(id)=>{ try{navigator.share?.({title:'Buy My Behavior', url: location.href});}catch{}}} />;
}

// ============================== Preview (демо) =============================
export function BehaviorsFeedPreview(){
  const demo:BehaviorItem[] = [
    { id:1, title:'Video evidence', description:'Завантажено з StoryBar', mediaUrl:null, isEvidence:true, disputeId:'d1', disputeStatus:'open', disputeStats:{ performer:12, customer:8 }, authorId:'u1', authorAvatarUrl:null },
    { id:2, title:'Класичний біхейворс', description:'Без спору', mediaUrl:null, isEvidence:false, authorId:'u2', authorAvatarUrl:null },
  ];
  return <BehaviorsFeedFullScreen items={demo}/>;
}

// ============================ Default export ============================
export default function BehaviorsFeedEntry(){
  return hasLiveCreds ? <BehaviorsFeedLiveFromSupabase/> : <BehaviorsFeedPreview/>;
}

// =============================== PROD Loader ===============================
/**
 * Прод‑варіант: підтягує реальні записи через переданий `supabase` або через `loader`.
 * ◂ Включає підрахунок голосів (таблиця/view `dispute_vote_counts`) і мій голос.
 * ◂ Дозволяє голосування через upsert у `dispute_votes` по (dispute_id,user_id).
 */
export function BehaviorsFeedProd({ loader, supabase: sbFromProp }: { loader?: () => Promise<BehaviorItem[]>; supabase?: any } = {}){
  const [items,setItems] = useState<BehaviorItem[]>([]);
  const sb = useMemo(()=> sbFromProp || (typeof window!=='undefined' ? (window as any).supabase : undefined), [sbFromProp]);

  useEffect(()=>{ let alive=true; (async()=>{
    try{
      let list:BehaviorItem[]|null=null;
      if (typeof loader==='function') list = await loader();
      else if (typeof window!=='undefined' && typeof window.__bmb_load_behaviors==='function') list = await window.__bmb_load_behaviors();
      else if (sb && sb.from){
        const { data, error } = await sb.from('behaviors').select(`
          id, ipfs_cid, file_url, thumbnail_url, title, description, created_at,
          dispute_id, author_id, is_dispute_evidence,
          profiles:author_id(id, avatar_url)
        `).order('created_at',{ascending:false}).limit(100);
        if (error) throw error;
        const base:BehaviorItem[] = (data||[]).map((b:any)=>({
          id:b.id, title:b.title, description:b.description, authorId:b.author_id??null,
          authorAvatarUrl:b?.profiles?.avatar_url??null,
          mediaUrl: b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url??null),
          posterUrl:b.thumbnail_url??null, createdAt:b.created_at??null,
          isEvidence: !!b.is_dispute_evidence, disputeId:b.dispute_id??null,
        }));
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
      } else list = [];
      if (alive) setItems(list||[]);
    }catch(e){ console.error('BehaviorsFeedProd load:', e); if(alive) setItems([]); }
  })(); return ()=>{alive=false}; }, [loader, sb]);

  const cast = async (disputeId:string, choice:VoteChoice)=>{
    if (!sb) return;
    const { data: auth } = await sb.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid){ alert('Увійдіть, щоб голосувати'); return; }
    // upsert по унікальному ключу (dispute_id,user_id)
    const { error } = await sb.from('dispute_votes').upsert({ dispute_id: disputeId, user_id: uid, choice }, { onConflict: 'dispute_id,user_id' });
    if (error){ alert(error.message); return; }
    // оновити лічильники
    const { data: cnt } = await sb.from('dispute_vote_counts').select('dispute_id, performer_votes, customer_votes').eq('dispute_id', disputeId).maybeSingle();
    setItems((prev)=> prev.map((it)=> it.disputeId===disputeId ? ({ ...it, myVote: choice, disputeStats: { performer: cnt?.performer_votes||0, customer: cnt?.customer_votes||0 }}) : it));
  };

  return <BehaviorsFeedFullScreen items={items} onVote={cast} onOpenAuthor={(aid)=>{ try{ if(aid) window.location.href=`/map?profile=${aid}` }catch{}}} onViewDispute={(id)=>{ try{ window.location.href=`/disputes/${id}` }catch{}}} onShare={()=>{ try{navigator.share?.({title:'Buy My Behavior', url: location.href});}catch{}}} />;
}
