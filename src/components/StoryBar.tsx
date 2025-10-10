// src/components/StoryBar.tsx
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
const MAX_ITEMS = 24;

// ---------- helpers ----------
const isVideo = (url?: string | null) => {
  if (!url) return false;
  const u = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v)$/.test(u);
};

const buildSrc = (b: Behavior) =>
  b.file_url || (b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : null);

const readCache = (): Behavior[] => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const writeCache = (items: Behavior[]) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch {}
};

// груба, але швидка перевірка рівності списків
function listsEqual(a: Behavior[], b: Behavior[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  if (a[0]?.id !== b[0]?.id) return false;
  if (a[a.length - 1]?.id !== b[b.length - 1]?.id) return false;
  return true;
}

// Ледача підвантажка відео (економить мережу/CPU поза екраном)
function LazyVideo({
  src, onError, width = 64, height = 64,
}: { src: string; onError?: () => void; width?: number; height?: number }) {
  const ref = React.useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      rootMargin: '200px',
      threshold: 0.01,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      className="sb-media"
      src={src}
      preload={visible ? 'metadata' : 'none'}
      muted
      playsInline
      width={width}
      height={height}
      onError={onError}
    />
  );
}

// ---------- component ----------
function StoryBarInner() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Behavior[]>(() => readCache());
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // життєвий цикл/дедуп
  const mountedRef = useRef(true);
  const lastListRef = useRef<Behavior[]>(items);
  const insertSeenRef = useRef<Set<number>>(new Set(items.map(x => x.id)));

  // refresh from DB
  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('behaviors')
      .select('id,user_id,title,description,ipfs_cid,file_url,created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS);

    if (error) {
      console.warn('[StoryBar] fetch error:', error?.message);
      return;
    }
    if (!Array.isArray(data)) return;

    const next = data as Behavior[];
    if (!mountedRef.current) return;

    if (!listsEqual(lastListRef.current, next)) {
      setItems(next);
      lastListRef.current = next;
      writeCache(next);
      insertSeenRef.current = new Set(next.map(x => x.id));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // кеш уже відмальований; довантажимо свіжі дані у наступний тік
    const t = setTimeout(() => { refresh(); }, 0);

    // realtime INSERT з дедупом
    const ch = supabase
      .channel('sb_behaviors')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'behaviors' },
        (payload: any) => {
          if (!mountedRef.current) return;
          const row = payload?.new as Behavior | undefined;
          if (!row || typeof row.id !== 'number') return;
          if (insertSeenRef.current.has(row.id)) return; // дедуп
          insertSeenRef.current.add(row.id);

          setItems(prev => {
            if (prev.some(x => x.id === row.id)) return prev;
            const next = [row, ...prev].slice(0, MAX_ITEMS);
            lastListRef.current = next;
            writeCache(next);
            return next;
          });
        }
      )
      .subscribe();

    // локальна подія від UploadBehavior
    const onUploaded = () => refresh();
    window.addEventListener('behaviorUploaded', onUploaded as any);

    return () => {
      mountedRef.current = false;
      clearTimeout(t);
      try { ch.unsubscribe(); } catch {}
      window.removeEventListener('behaviorUploaded', onUploaded as any);
    };
  }, [refresh]);

  const markBroken = useCallback((id: number) => {
    setBroken(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleOpenBehaviors = useCallback(() => {
    navigate('/behaviors');
  }, [navigate]);

  const circles = useMemo(() => {
    return items.map((b) => {
      const src = buildSrc(b);
      const isBroken = broken.has(b.id);
      return (
        <button
          key={b.id}
          type="button"
          className="sb-item"
          title={b.title ?? 'Переглянути'}
          onClick={handleOpenBehaviors}
        >
          {src && !isBroken ? (
            isVideo(src) ? (
              <LazyVideo src={`${src}#t=0.001`} onError={() => markBroken(b.id)} />
            ) : (
              <img
                className="sb-media"
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                crossOrigin="anonymous"
                width={64}
                height={64}
                onError={() => markBroken(b.id)}
              />
            )
          ) : (
            <div className="sb-fallback" />
          )}
        </button>
      );
    });
  }, [items, broken, handleOpenBehaviors, markBroken]);

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
        {circles}
      </div>

      {/* Жива модалка аплоаду */}
      {isUploadOpen && <UploadBehavior onClose={() => setIsUploadOpen(false)} />}
    </div>
  );
}

// Ізоляція від зайвих ререндерів батьків
export default React.memo(StoryBarInner);
