// src/components/StoryBar.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import UploadBehavior from './UploadBehavior';
import './StoryBar.css';

type Behavior = {
  id: number;
  user_id: string | null;
  title: string | null;
  description: string | null;
  ipfs_cid: string | null;
  file_url?: string | null;
  created_at: string;
};

const CACHE_KEY = 'bmb:storybar:v1';

const isVideo = (url?: string | null) => {
  if (!url) return false;
  const u = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v)$/.test(u);
};

const buildSrc = (b: Behavior) =>
  b.file_url || (b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : null);

// helpers: cache
const readCache = (): Behavior[] => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};
const writeCache = (items: Behavior[]) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch {}
};

export default function StoryBar() {
  const [items, setItems] = useState<Behavior[]>(readCache());
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // refresh from DB
  const refresh = async () => {
    const { data, error } = await supabase
      .from('behaviors')
      .select('id,user_id,title,description,ipfs_cid,file_url,created_at')
      .order('created_at', { ascending: false })
      .limit(24);

    if (!error && Array.isArray(data)) {
      setItems(data as Behavior[]);
      writeCache(data as Behavior[]);
    } else {
      // залишаємо кеш, щоб не мигало
      console.warn('[StoryBar] fetch error:', error?.message);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1) миттєво показали кеш (він уже у useState)
    // 2) довантажуємо свіжі дані
    refresh();

    // 3) realtime INSERT
    const ch = supabase
      .channel('sb_behaviors')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'behaviors' },
        (payload: any) => {
          const row = payload.new as Behavior;
          if (!mounted) return;
          setItems(prev => {
            const next = prev.some(x => x.id === row.id) ? prev : [row, ...prev].slice(0, 24);
            writeCache(next);
            return next;
          });
        }
      )
      .subscribe();

    // 4) локальна подія від UploadBehavior (дублюємо на всяк випадок)
    const onUploaded = () => refresh();
    window.addEventListener('behaviorUploaded', onUploaded as any);

    return () => {
      mounted = false;
      try { ch.unsubscribe(); } catch {}
      window.removeEventListener('behaviorUploaded', onUploaded as any);
    };
  }, []);

  const markBroken = (id: number) => setBroken(prev => new Set(prev).add(id));

  return (
    <div className="story-bar" data-bmb-storybar="">
      <div className="sb-container">
        {/* Кнопка "+" */}
        <button
          type="button"
          className="sb-item sb-item-add"
          onClick={() => setIsUploadOpen(true)}
          aria-label="Додати Behavior"
          title="Додати Behavior"
        >
          <span className="sb-plus">+</span>
        </button>

        {/* Історії */}
        {items.map((b) => {
          const src = buildSrc(b);
          const isBroken = broken.has(b.id);
          return (
            <button
              key={b.id}
              type="button"
              className="sb-item"
              title={b.title ?? 'Переглянути'}
              onClick={() => window.location.assign('/behaviors')}
            >
              {src && !isBroken ? (
                isVideo(src) ? (
                  <video
                    className="sb-media"
                    src={`${src}#t=0.001`}
                    preload="metadata"
                    muted
                    playsInline
                    onError={() => markBroken(b.id)}
                  />
                ) : (
                  <img
                    className="sb-media"
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    crossOrigin="anonymous"
                    onError={() => markBroken(b.id)}
                  />
                )
              ) : (
                <div className="sb-fallback" />
              )}
            </button>
          );
        })}
      </div>

      {/* Жива модалка аплоаду */}
      {isUploadOpen && (
        <UploadBehavior onClose={() => setIsUploadOpen(false)} />
      )}
    </div>
  );
}
