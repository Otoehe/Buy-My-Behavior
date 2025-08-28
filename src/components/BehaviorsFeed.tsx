'use client'

// Behaviors Feed (full‑screen vertical, scroll‑snap, BMB brand)
// ✅ 1 картка = 1 екран (100vh), скрол по одному елементу
// ✅ Текст сценарію зверху зліва у напівпрозорому рожевому блоці (читабельно на мобільному)
// ✅ Кнопка «Поділитись» праворуч зверху, аватар власника знизу зліва (натиснув — перехід у профіль)
// ✅ Кнопки на картці: без спору — «обрати сторону…», зі спором — «підтримати сторону…» + бейдж ⚖️
// ✅ Звук/музика лише в активному екрані (autoplay muted → toggle)
// ⚠️ У РЕПО: НЕ експортуй PREVIEW як default. Використовуй `BehaviorsFeedFullScreen` з реальними даними.

import React, { useEffect, useRef, useState } from 'react'

// ================================ Types ====================================
export type BehaviorItem = {
  id: number | string
  title?: string
  description?: string
  authorId?: string | null
  authorAvatarUrl?: string | null
  mediaUrl?: string | null // відео (звукові доріжки підтримуються)
  posterUrl?: string | null
  musicUrl?: string | null // опційно: окремий аудіотрек
  createdAt?: string | null
  // ⚖️ спір
  disputeId?: string | null
  disputeStatus?: 'open' | 'closed' | 'resolved' | null
  disputeStats?: { performer?: number; customer?: number } | null
}

export type BehaviorsFeedProps = {
  items: BehaviorItem[]
  onPickPerformer?: (id: BehaviorItem['id']) => void
  onPickCustomer?: (id: BehaviorItem['id']) => void
  onShare?: (id: BehaviorItem['id']) => void
  onOpenAuthor?: (authorId: string) => void
  // спор
  onViewDispute?: (id: BehaviorItem['id']) => void
  onVotePerformer?: (id: BehaviorItem['id']) => void
  onVoteCustomer?: (id: BehaviorItem['id']) => void
}

// ========================== Full‑screen Feed ===============================
export const BehaviorsFeedFullScreen: React.FC<BehaviorsFeedProps> = ({ items, onPickPerformer, onPickCustomer, onShare, onOpenAuthor, onViewDispute, onVotePerformer, onVoteCustomer }) => {
  const [activeId, setActiveId] = useState<BehaviorItem['id'] | null>(items?.[0]?.id ?? null)
  const [mutedMap, setMutedMap] = useState<Record<string | number, boolean>>({})

  const videoRefs = useRef<Record<string | number, HTMLVideoElement | null>>({})
  const audioRefs = useRef<Record<string | number, HTMLAudioElement | null>>({})
  const wrapRefs = useRef<Record<string | number, HTMLElement | null>>({})

  // snap observer
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((ent) => {
          const id = (ent.target as HTMLElement).dataset.id!
          if (ent.isIntersecting && ent.intersectionRatio >= 0.7) setActiveId(id)
        })
      },
      { threshold: [0.7] }
    )
    Object.values(wrapRefs.current).forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [items])

  // play/pause only active
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, v]) => {
      if (!v) return
      const shouldPlay = String(id) === String(activeId)
      v.muted = !!mutedMap[id]
      if (shouldPlay) v.play().catch(() => {})
      else v.pause()
    })
    Object.entries(audioRefs.current).forEach(([id, a]) => {
      if (!a) return
      const shouldPlay = String(id) === String(activeId)
      a.muted = !!mutedMap[id]
      if (shouldPlay) a.play().catch(() => {})
      else a.pause()
    })
  }, [activeId, mutedMap])

  const container: React.CSSProperties = {
    height: '100vh',
    overflowY: 'auto',
    scrollSnapType: 'y mandatory',
    background: '#f8f5f6',
  }

  const section: React.CSSProperties = {
    position: 'relative',
    height: '100vh',
    scrollSnapAlign: 'start',
    display: 'grid',
    placeItems: 'center',
  }

  const media: React.CSSProperties = {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%', objectFit: 'cover',
    background: 'linear-gradient(180deg,#ffd9e1,#ffeef2)'
  }

  const captionWrap: React.CSSProperties = {
    position: 'absolute', top: 12, left: 12, maxWidth: '76%',
    background: 'rgba(255,205,214,.9)', border: '2px solid #ffcdd6',
    borderRadius: 16, padding: '10px 12px', color: '#111'
  }
  const titleStyle: React.CSSProperties = { fontWeight: 900, fontSize: 16, marginBottom: 4 }
  const descStyle: React.CSSProperties = { fontSize: 14, lineHeight: 1.5 }

  const shareBtn: React.CSSProperties = {
    position: 'absolute', top: 12, right: 12,
    width: 40, height: 40, borderRadius: 999,
    border: '2px solid #ffcdd6', background: '#111', color: '#fff',
    display: 'grid', placeItems: 'center', fontWeight: 900, boxShadow: '0 8px 24px rgba(0,0,0,.25)'
  }

  const avatarWrap: React.CSSProperties = {
    position: 'absolute', left: 12, bottom: 70,
    width: 56, height: 56, borderRadius: '50%',
    border: '2px solid #ddd', overflow: 'hidden', background: '#fff', boxShadow: '0 6px 20px rgba(0,0,0,.18)', cursor: 'pointer'
  }

  const soundBtn: React.CSSProperties = {
    position: 'absolute', right: 12, bottom: 70,
    width: 44, height: 44, borderRadius: 999,
    border: '1px solid rgba(17,17,17,.2)', background: '#fff',
    display: 'grid', placeItems: 'center', fontWeight: 900, cursor: 'pointer'
  }

  const actionsWrap: React.CSSProperties = {
    position: 'absolute', left: 12, right: 12, bottom: 14,
    display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center'
  }
  const sideBtn: React.CSSProperties = {
    borderRadius: 999, padding: '10px 14px', fontWeight: 800,
    background: '#9ca3af', color: '#fff', border: 'none'
  }
  const voteBtn: React.CSSProperties = { ...sideBtn, background: '#111', border: '1px solid #111' }

  const chip: React.CSSProperties = {
    position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
    background: '#fff', border: '1px solid #ffd6df', padding: '6px 10px', borderRadius: 999,
    boxShadow: '0 4px 16px rgba(0,0,0,.08)', fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center'
  }

  const statsPill: React.CSSProperties = {
    display: 'inline-grid', gridTemplateColumns: '1fr 1fr', gap: 6,
    background: '#fff', border: '1px solid #eee', borderRadius: 999, padding: '4px 8px', fontSize: 12
  }

  const fmt = (v?: string | null) => (v ? v : '')

  const handleShare = (it: BehaviorItem) => {
    const url = it.mediaUrl || (typeof window !== 'undefined' ? window.location.href : '')
    if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ title: it.title || 'Buy My Behavior', url }).catch(()=>{})
    else onShare?.(it.id)
  }

  const onToggleMute = (id: BehaviorItem['id']) => setMutedMap(prev => ({ ...prev, [String(id)]: !prev[String(id)] }))

  return (
    <div style={container}>
      {items.map((it) => {
        const id = String(it.id)
        const muted = !!mutedMap[id]
        const hasDispute = !!it.disputeId
        const perf = it.disputeStats?.performer ?? 0
        const cust = it.disputeStats?.customer ?? 0
        return (
          <section key={id} data-id={id} ref={(el) => (wrapRefs.current[id] = el)} style={section}>
            {/* VIDEO (if present) */}
            {it.mediaUrl ? (
              <video
                ref={(v) => (videoRefs.current[id] = v)}
                src={it.mediaUrl || undefined}
                poster={it.posterUrl || undefined}
                style={media}
                playsInline muted loop preload="metadata" autoPlay
              />
            ) : (
              // Fallback красивий градієнт, якщо немає відео
              <div style={media} />
            )}

            {/* MUSIC (optional separate track) */}
            {it.musicUrl && (
              <audio ref={(a) => (audioRefs.current[id] = a)} src={it.musicUrl || undefined} preload="metadata" />
            )}

            {/* CAPTION (top‑left) */}
            {(it.title || it.description) && (
              <div style={captionWrap}>
                {it.title && <div style={titleStyle}>{fmt(it.title)}</div>}
                {it.description && <div style={descStyle}>{fmt(it.description)}</div>}
              </div>
            )}

            {/* DISPUTE CHIP (top‑center) */}
            {hasDispute && (
              <div style={chip}>
                <span>⚖️ Спір</span>
                {(perf > 0 || cust > 0) && (
                  <span style={statsPill}><span>👷 {perf}</span><span>🧑‍💼 {cust}</span></span>
                )}
                {it.disputeStatus === 'open' && <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 800 }}>open</span>}
              </div>
            )}

            {/* SHARE (top‑right) */}
            <button aria-label="Поділитись" style={shareBtn} onClick={() => handleShare(it)}>↗</button>

            {/* AVATAR (bottom‑left) */}
            <div
              aria-label="Профіль автора"
              style={avatarWrap}
              onClick={() => it.authorId && onOpenAuthor?.(it.authorId)}
              title="Відкрити профіль"
            >
              {it.authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.authorAvatarUrl} alt="author" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e)=>((e.currentTarget as HTMLImageElement).style.display='none')} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontWeight: 900, color: '#111' }}>U</div>
              )}
            </div>

            {/* SOUND TOGGLE (bottom‑right) */}
            {(it.mediaUrl || it.musicUrl) && (
              <button aria-label={muted ? 'Увімкнути звук' : 'Вимкнути звук'} style={soundBtn} onClick={() => onToggleMute(it.id)}>
                {muted ? '🔇' : '🔊'}
              </button>
            )}

            {/* ACTIONS (bottom) */}
            <div style={actionsWrap}>
              {hasDispute && it.disputeStatus === 'open' ? (
                <>
                  <button style={voteBtn} onClick={() => onVotePerformer?.(it.id)}>підтримати виконавця</button>
                  <button style={voteBtn} onClick={() => onVoteCustomer?.(it.id)}>підтримати замовника</button>
                  <button style={sideBtn} onClick={() => onViewDispute?.(it.id)}>деталі спору</button>
                </>
              ) : hasDispute ? (
                <>
                  <button style={sideBtn} onClick={() => onViewDispute?.(it.id)}>результат спору</button>
                </>
              ) : (
                <>
                  <button style={sideBtn} onClick={() => onPickPerformer?.(it.id)}>обрати сторону виконавця</button>
                  <button style={sideBtn} onClick={() => onPickCustomer?.(it.id)}>обрати сторону замовника</button>
                </>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ============================== Canvas Preview =============================
export default function BehaviorsFeedPreview() {
  const demo: BehaviorItem[] = [
    { id: 1, title: 'Щоденна прогулянка 10к кроків', description: 'Сценарій читається поверх, компактно й читабельно.', authorId: 'u1', authorAvatarUrl: null, mediaUrl: null, posterUrl: null },
    { id: 2, title: 'Вчасний сон 22:30', description: `М’який рожевий блок.
Прев’ю у Canvas без зовнішніх ресурсів.`, authorId: 'u2', mediaUrl: null, posterUrl: null, disputeId: 'dsp_22', disputeStatus: 'open', disputeStats: { performer: 12, customer: 8 } },
    { id: 3, title: '30 хв читання', description: 'Кнопка поділитись праворуч. Аватар знизу ліворуч.', authorId: 'u3', mediaUrl: null, posterUrl: null },
    { id: 4, title: 'Довгий опис для перевірки переносу', description: `Це дуже довгий текст опису, який перевіряє перенос рядків,
scroll‑snap між екранами і відображення напівпрозорого блоку.`, authorId: 'u4', mediaUrl: null, posterUrl: null, disputeId: 'dsp_44', disputeStatus: 'closed', disputeStats: { performer: 30, customer: 31 } },
  ]

  return (
    <BehaviorsFeedFullScreen
      items={demo}
      onPickPerformer={(id) => alert('Вибрано сторону виконавця #' + id)}
      onPickCustomer={(id) => alert('Вибрано сторону замовника #' + id)}
      onShare={(id) => alert('Поділитись #' + id)}
      onOpenAuthor={(aid) => alert('Відкрити профіль: ' + aid)}
      onViewDispute={(id) => alert('Відкрити спір #' + id)}
      onVotePerformer={(id) => alert('Голос за виконавця #' + id)}
      onVoteCustomer={(id) => alert('Голос за замовника #' + id)}
    />
  )
}

// =========================== Інтеграція у репо ============================
// 1) Drop‑in return(...) під реальні дані + спори:
//
// return (
//   <BehaviorsFeedFullScreen
//     items={behaviors.map((b) => ({
//       id: b.id,
//       title: scenarioTextByBehavior[b.id]?.title ?? undefined,
//       description: scenarioTextByBehavior[b.id]?.description ?? (b.description ?? undefined),
//       authorId: b.author_id ?? null,
//       authorAvatarUrl: b.author_avatar_url ?? null,
//       mediaUrl: b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url ?? null),
//       posterUrl: b.thumbnail_url ?? null,
//       createdAt: b.created_at ?? null,
//       // ⚖️ додаємо спір
//       disputeId: (disputeMap?.[b.id]) || b.dispute_id || null,
//       disputeStatus: (disputeStatusMap?.[b.id]) || null,
//       disputeStats: (disputeStatsMap?.[b.id]) || null,
//     }))}
//     onOpenAuthor={(aid) => navigate('/map', { state: { profile: aid } })}
//     onShare={(id) => {
//       const b = behaviors.find(x => String(x.id) === String(id));
//       const url = b?.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b?.file_url ?? window.location.href);
//       if (navigator.share) navigator.share({ title: (scenarioTextByBehavior[b?.id||0]?.title) || 'Buy My Behavior', url }).catch(()=>{});
//     }}
//     // Голосування/деталі
//     onViewDispute={(id) => console.log('open dispute', id)}
//     onVotePerformer={(id) => console.log('vote performer', id)}
//     onVoteCustomer={(id) => console.log('vote customer', id)}
//   />
// )
//
// 2) Як отримати карти спорів (приклад):
//    - disputeMap: { behavior_id -> dispute_id }
//    - disputeStatusMap: { behavior_id -> 'open'|'closed' }
//    - disputeStatsMap: { behavior_id -> { performer, customer } }
//
// const ids = rows.map(r => r.id)
// const { data: dByBeh } = await supabase
//   .from('disputes')
//   .select('id, behavior_id, status, performer_votes, customer_votes')
//   .in('behavior_id', ids)
//
// const disputeMap: Record<number,string> = {}
// const disputeStatusMap: Record<number,'open'|'closed'|'resolved'> = {} as any
// const disputeStatsMap: Record<number,{performer:number;customer:number}> = {}
// ;(dByBeh||[]).forEach((d:any)=>{
//   if (d.behavior_id) {
//     disputeMap[d.behavior_id] = d.id
//     disputeStatusMap[d.behavior_id] = d.status
//     disputeStatsMap[d.behavior_id] = { performer: d.performer_votes||0, customer: d.customer_votes||0 }
//   }
// })
//
// 3) Якщо у вас логіка спорів через scenario_id → беріть best‑диспут (open > latest) і проєктуйте на behavior_id,
//    як ми робили раніше; просто запишіть результат у три мапи вище.
