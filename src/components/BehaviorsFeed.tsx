'use client'

// Behaviors Feed (full‑screen vertical, scroll‑snap, BMB brand)
// ✅ 1 картка = 1 екран (100vh), скрол по одному елементу
// ✅ Текст сценарію зверху зліва у напівпрозорому рожевому блоці (читабельно на мобільному)
// ✅ Кнопка «Поділитись» праворуч зверху, аватар власника знизу зліва (натиснув — перехід у профіль)
// ✅ Кнопки вибору сторони (виконавець/замовник) — знизу (як на ескізі)
// ✅ Музика/звук: якщо у айтема є відео — керуємо звуком відео; якщо є music_url — керуємо аудіо
// ⚠️ У РЕПО: НЕ експортуй PREVIEW як default. Використовуй `BehaviorsFeedFullScreen` з реальними даними.
// ⚠️ Якщо бачиш демо‑тексти («Щоденна прогулянка…») — ти випадково підхопив PREVIEW у проді.

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
}

export type BehaviorsFeedProps = {
  items: BehaviorItem[]
  onPickPerformer?: (id: BehaviorItem['id']) => void
  onPickCustomer?: (id: BehaviorItem['id']) => void
  onShare?: (id: BehaviorItem['id']) => void
  onOpenAuthor?: (authorId: string) => void
}

// ========================== Full‑screen Feed ===============================
export const BehaviorsFeedFullScreen: React.FC<BehaviorsFeedProps> = ({ items, onPickPerformer, onPickCustomer, onShare, onOpenAuthor }) => {
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
    display: 'flex', justifyContent: 'space-between', gap: 12
  }
  const sideBtn: React.CSSProperties = {
    borderRadius: 999, padding: '10px 14px', fontWeight: 800,
    background: '#9ca3af', color: '#fff', border: 'none'
  }

  const fmt = (v?: string | null) => (v ? v : '')

  const handleShare = (it: BehaviorItem) => {
    const url = it.mediaUrl || window.location.href
    if (navigator.share) navigator.share({ title: it.title || 'Buy My Behavior', url }).catch(()=>{})
    else onShare?.(it.id)
  }

  const onToggleMute = (id: BehaviorItem['id']) => setMutedMap(prev => ({ ...prev, [String(id)]: !prev[String(id)] }))

  return (
    <div style={container}>
      {items.map((it) => {
        const id = String(it.id)
        const muted = !!mutedMap[id]
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
              <button style={sideBtn} onClick={() => onPickPerformer?.(it.id)}>обрати сторону виконавця</button>
              <button style={sideBtn} onClick={() => onPickCustomer?.(it.id)}>обрати сторону замовника</button>
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
Прев’ю у Canvas без зовнішніх ресурсів.`, authorId: 'u2', mediaUrl: null, posterUrl: null },
    { id: 3, title: '30 хв читання', description: 'Кнопка поділитись праворуч. Аватар знизу ліворуч.', authorId: 'u3', mediaUrl: null, posterUrl: null },
    { id: 4, title: 'Довгий опис для перевірки переносу', description: `Це дуже довгий текст опису, який перевіряє перенос рядків,
scroll‑snap між екранами і відображення напівпрозорого блоку.`, authorId: 'u4', mediaUrl: null, posterUrl: null },
  ]

  return (
    <BehaviorsFeedFullScreen
      items={demo}
      onPickPerformer={(id) => alert('Вибрано сторону виконавця #' + id)}
      onPickCustomer={(id) => alert('Вибрано сторону замовника #' + id)}
      onShare={(id) => alert('Поділитись #' + id)}
      onOpenAuthor={(aid) => alert('Відкрити профіль: ' + aid)}
    />
  )
}

// =========================== Інтеграція у репо ============================
// 1) У вашому файлі з реальними даними (де вже є `behaviors`, `scenarioTextByBehavior`, `navigate`, тощо)
//    ЗАМІНИ return(...) на цей drop‑in (підставляє дані у стрічку):
//
// return (
//   <BehaviorsFeedFullScreen
//     items={behaviors.map((b) => ({
//       id: b.id,
//       title: (scenarioTextByBehavior[b.id]?.title) ?? undefined,
//       description: (scenarioTextByBehavior[b.id]?.description) ?? (b.description ?? undefined),
//       authorId: b.author_id ?? null,
//       authorAvatarUrl: b.author_avatar_url ?? null,
//       mediaUrl: b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url ?? null),
//       posterUrl: b.thumbnail_url ?? null,
//       musicUrl: null,
//       createdAt: b.created_at ?? null,
//     }))}
//     onOpenAuthor={(aid) => navigate('/map', { state: { profile: aid } })}
//     onShare={(id) => {
//       const b = behaviors.find(x => String(x.id) === String(id));
//       const url = b?.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b?.file_url ?? window.location.href);
//       if (navigator.share) navigator.share({ title: (scenarioTextByBehavior[b?.id||0]?.title) || 'Buy My Behavior', url }).catch(()=>{});
//     }}
//     onPickPerformer={(id) => console.log('pick performer', id)}
//     onPickCustomer={(id) => console.log('pick customer', id)}
//   />
// )
//
// 2) Якщо й далі порожньо — спершу застосуйте SAFE‑select без join (нижче), щоб прибрати 400.
// 3) Після підтвердження FK `behaviors.author_id → profiles.id` перейдіть на join з `profiles!behaviors_author_id_fkey(...)`.
//
// --- SAFE Supabase load() для проду (хот‑фік 400) ---
// const { data, error } = await supabase
//   .from('behaviors')
//   .select('id, ipfs_cid, file_url, thumbnail_url, description, created_at, author_id')
//   .order('created_at', { ascending: false });
// let rows = data ?? [];
// if (error) {
//   console.error('[behaviors.load] base select error:', error);
//   const fb = await supabase
//     .from('behaviors')
//     .select('id, ipfs_cid, file_url, thumbnail_url, description, author_id')
//     .limit(50);
//   rows = fb.data ?? [];
//   if (fb.error) console.error('[behaviors.load] fallback error:', fb.error);
// }
// const mapped = rows.map((b: any) => ({ ...b, author_avatar_url: null }));
// setBehaviors(mapped);
// if (mapped.length) setActiveId(mapped[0].id);
//
// --- ПОВЕРТАЄМО аватари (правильний join) ---
// SQL FK: alter table behaviors add constraint behaviors_author_id_fkey foreign key (author_id) references profiles(id);
// const { data, error } = await supabase
//   .from('behaviors')
//   .select(`
//     id, ipfs_cid, file_url, thumbnail_url, description, created_at, author_id,
//     profiles!behaviors_author_id_fkey( avatar_url )
//   `)
//   .order('created_at', { ascending: false });
// const rows2 = (data ?? []).map((b: any) => ({ ...b, author_avatar_url: b?.profiles?.avatar_url ?? null }));
// setBehaviors(rows2);
// if (rows2.length) setActiveId(rows2[0].id);
//
// --- Хелпер мапінгу (якщо треба під цей компонент): ---
// function toItem(b: any, st: any): BehaviorItem {
//   return {
//     id: b.id,
//     title: st?.title ?? undefined,
//     description: st?.description ?? (b.description ?? undefined),
//     authorId: b.author_id ?? null,
//     authorAvatarUrl: b.author_avatar_url ?? null,
//     mediaUrl: b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url ?? null),
//     posterUrl: b.thumbnail_url ?? null,
//     musicUrl: null,
//     createdAt: b.created_at ?? null,
//   }
// }
//
// Якщо behaviors у проді — це view (а не таблиця), напиши — дам селект без order()/range для view.
