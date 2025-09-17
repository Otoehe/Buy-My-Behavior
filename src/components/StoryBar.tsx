import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
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

const isVideo = (url?: string | null) => {
  if (!url) return false;
  const u = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v)$/.test(u);
};
const buildSrc = (b: Behavior) =>
  b.file_url || (b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : null);

const SEEN_KEY = 'bmb_seen_ids';

export default function StoryBar() {
  const [items, setItems] = useState<Behavior[]>([]);
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [seen, setSeen] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
    catch { return new Set(); }
  });

  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1) початкове завантаження
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('behaviors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(24);
      if (Array.isArray(data)) setItems(data as Behavior[]);
    })();
  }, []);

  // 2) realtime INSERT
  useEffect(() => {
    const ch = supabase.channel('realtime:behaviors');
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'behaviors' },
      (payload: any) => {
        const row = payload.new as Behavior;
        setItems(prev => (prev.some(x => x.id === row.id) ? prev : [row, ...prev].slice(0, 24)));
      }
    );
    ch.subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  // 3) зберігаємо “переглянуті”
  useEffect(() => {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  }, [seen]);

  // 4) lazy play/pause для відео в межах контейнера
  useEffect(() => {
    if (!containerRef.current || !('IntersectionObserver' in window)) return;
    const root = containerRef.current;
    const videos = root.querySelectorAll<HTMLVideoElement>('video[data-sb]');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      });
    }, { root, threshold: 0.5 });
    videos.forEach(v => io.observe(v));
    return () => io.disconnect();
  }, [items]);

  const markBroken = (id: number) => setBroken(prev => new Set(prev).add(id));
  const openFeed = () => navigate('/behaviors');

  return (
    <div className="story-bar" data-bmb-storybar="">
      <div className="sb-container" ref={containerRef}>
        {/* PLUS */}
        <button
          type="button"
          className="sb-item sb-item-add"
          onClick={openFeed}
          aria-label="Додати Behavior"
          title="Додати Behavior"
        >
          <span className="sb-plus">+</span>
        </button>

        {/* BEHAVIORS */}
        {items.map((b) => {
          const src = buildSrc(b);
          const isBroken = broken.has(b.id);
          const isSeen = seen.has(b.id);

          return (
            <button
              key={b.id}
              type="button"
              className={`sb-item ${isSeen ? 'sb-item--seen' : 'sb-item--ring'}`}
              title={b.title ?? 'Переглянути'}
              onClick={() => {
                setSeen(prev => new Set(prev).add(b.id));
                openFeed();
              }}
            >
              {src && !isBroken ? (
                isVideo(src) ? (
                  <video
                    data-sb
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
    </div>
  );
}
