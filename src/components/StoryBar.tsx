// src/components/StoryBar.tsx
// ЄДИНИЙ сторісбар: 24 останні behaviors, realtime INSERT, відписування.
// Підтримка прев'ю відео (перша рамка) та зображень.
// Сінглтон-захист від дубльованого монтування.

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

declare global {
  interface Window { __BMB_STORYBAR_MOUNTED__?: boolean }
}

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
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const navigate = useNavigate();

  // 🔒 Сінглтон
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!window.__BMB_STORYBAR_MOUNTED__) {
      window.__BMB_STORYBAR_MOUNTED__ = true;
      setActive(true);
      return () => { window.__BMB_STORYBAR_MOUNTED__ = false; };
    } else {
      setActive(false);
    }
  }, []);

  // Initial
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('behaviors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(24);
      if (!error && !cancelled && Array.isArray(data)) {
        setItems(data as Behavior[]);
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  // Realtime INSERT
  useEffect(() => {
    if (!active) return;
    const ch = supabase.channel('realtime:behaviors', {
      config: { broadcast: { ack: false }, presence: { key: 'storybar' } },
    });
    ch.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'behaviors' },
      (payload: any) => {
        const row = payload.new as Behavior;
        setItems(prev => {
          if (prev.some(x => x.id === row.id)) return prev;
          const next = [row, ...prev];
          return next.slice(0, 24);
        });
      }
    );
    ch.subscribe();
    chRef.current = ch;
    return () => { try { if (chRef.current) supabase.removeChannel(chRef.current); } catch {} chRef.current = null; };
  }, [active]);

  const markBroken = (id: number) => setBroken(prev => new Set(prev).add(id));
  const openFeed = () => navigate('/behaviors');

  if (!active) return null;

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
