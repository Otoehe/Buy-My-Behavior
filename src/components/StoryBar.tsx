// ЄДИНИЙ сторісбар: 24 останні behaviors, realtime INSERT.
// Сінглтон-захист від дубльованого монтування та підписок.

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

// ───── сінглтон охорона (на рівні модуля) ─────
let SB_INITED = false;
let SB_CHANNEL: ReturnType<typeof supabase.channel> | null = null;

const isVideo = (url?: string | null) => {
  if (!url) return false;
  const u = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v)$/.test(u);
};

const buildSrc = (b: Behavior) =>
  b.file_url || (b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : null);

export default function StoryBar() {
  const [items, setItems] = useState<Behavior[]>([]);
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();

  // ініціальна вибірка + realtime підписка — тільки один раз на весь app
  useEffect(() => {
    if (!SB_INITED) {
      SB_INITED = true;
      (async () => {
        const { data } = await supabase
          .from('behaviors')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(24);
        if (Array.isArray(data)) setItems(data as Behavior[]);
      })();

      if (!SB_CHANNEL) {
        const ch = supabase.channel('realtime:behaviors', {
          config: { broadcast: { ack: false }, presence: { key: 'storybar' } },
        });
        ch.on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'behaviors' },
          (payload: any) => {
            const row = payload.new as Behavior;
            setItems(prev => (prev.some(x => x.id === row.id) ? prev : [row, ...prev].slice(0, 24)));
          }
        );
        ch.subscribe();
        SB_CHANNEL = ch;
      }
    }

    // для відладки: очікуємо 1
    (window as any).__BMB_SB_MOUNTS__ = ((window as any).__BMB_SB_MOUNTS__ || 0) + 1;

    return () => {
      // SB_CHANNEL не відписуємо — він глобальний і має жити весь runtime
    };
  }, []);

  const markBroken = (id: number) => setBroken(prev => new Set(prev).add(id));
  const openFeed = () => navigate('/behaviors');

  return (
    <div className="story-bar" data-bmb-storybar="">
      <div className="sb-container">
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
