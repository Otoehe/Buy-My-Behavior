// ЄДИНИЙ сторісбар: 24 останні behaviors, realtime INSERT.
// Без імпорту nft.storage. Плюс відкриває ваш UploadBehavior.

import React, { useEffect, useRef, useState } from 'react';
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

const isVideo = (url?: string | null) => {
  if (!url) return false;
  const u = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v)$/.test(u);
};

const buildSrc = (b: Behavior) =>
  b.file_url || (b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : null);

// Глобальна підписка (уникаємо дубляжу між переходами)
let SB_INITED = false;
let SB_CHANNEL: ReturnType<typeof supabase.channel> | null = null;

export default function StoryBar() {
  const [items, setItems] = useState<Behavior[]>([]);
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();
  const barRef = useRef<HTMLDivElement>(null);

  // ініціальна вибірка + realtime підписка — лише один раз на весь runtime
  useEffect(() => {
    if (!SB_INITED) {
      SB_INITED = true;

      (async () => {
        const { data, error } = await supabase
          .from('behaviors')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(24);

        if (!error && Array.isArray(data)) {
          setItems(data as Behavior[]);
        }
      })();

      if (!SB_CHANNEL) {
        const ch = supabase.channel('realtime:behaviors', {
          config: { broadcast: { ack: false }, presence: { key: 'storybar' } },
        });

        ch.on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'behaviors' },
          (payload: any) => {
            const row = payload.new as Behavior;
            setItems(prev =>
              prev.some(x => x.id === row.id) ? prev : [row, ...prev].slice(0, 24)
            );
          }
        );

        ch.subscribe();
        SB_CHANNEL = ch;
      }
    }

    return () => {
      // Канал не відписуємо — він глобальний і корисний на інших роутерах
    };
  }, []);

  const markBroken = (id: number) => setBroken(prev => new Set(prev).add(id));
  const openFeed = () => navigate('/behaviors');

  // Легка оптимізація для відео: play/pause лише коли у видимій частині бару
  useEffect(() => {
    if (!barRef.current || !('IntersectionObserver' in window)) return;
    const root = barRef.current;
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          const el = e.target as HTMLVideoElement;
          if (e.isIntersecting) el.play().catch(() => {});
          else el.pause();
        });
      },
      { root, threshold: 0.6 }
    );

    root.querySelectorAll('video.sb-media').forEach(v => io.observe(v));
    return () => io.disconnect();
  }, [items]);

  return (
    <div className="story-bar" data-bmb-storybar="">
      <div ref={barRef} className="sb-container">
        {/* PLUS */}
        <button
          type="button"
          className="sb-item sb-item-add"
          onClick={() => setIsUploadOpen(true)}
          aria-label="Додати Behavior"
          title="Додати Behavior"
        >
          <span className="sb-plus">+</span>
        </button>

        {/* BEHAVIORS */}
        {items.map((b) => {
          const src = buildSrc(b);
          const isBroken = broken.has(b.id);

          return (
            <button
              key={b.id}
              type="button"
              className="sb-item"
              title={b.title ?? 'Переглянути'}
              onClick={openFeed}
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

      {isUploadOpen && <UploadBehavior onClose={() => setIsUploadOpen(false)} />}
    </div>
  );
}
