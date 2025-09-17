import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import UploadBehavior from './UploadBehavior';
import './StoryBar.css';

type Behavior = {
  id: number;
  user_id: string | null;
  title: string | null;
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

export default function StoryBar() {
  const [items, setItems] = useState<Behavior[]>([]);
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase
        .from('behaviors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(24);
      if (mounted && Array.isArray(data)) setItems(data as Behavior[]);
    })();

    const ch = supabase.channel('realtime:behaviors');
    ch.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'behaviors' },
      (payload: any) => {
        const row = payload.new as Behavior;
        setItems(prev => (prev.some(x => x.id === row.id) ? prev : [row, ...prev].slice(0,24)));
      }
    ).subscribe();

    return () => { mounted = false; ch.unsubscribe(); };
  }, []);

  const markBroken = (id: number) => setBroken(prev => new Set(prev).add(id));
  const openFeed = () => navigate('/behaviors');

  return (
    <div className="story-bar" data-bmb-storybar="">
      <div className="sb-container">
        {/* плюс */}
        <button
          type="button"
          className="sb-item sb-item-add"
          onClick={() => setIsUploadOpen(true)}
          aria-label="Додати Behavior"
          title="Додати Behavior"
        >
          <span className="sb-plus">+</span>
        </button>

        {/* елементи */}
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
                    crossOrigin="anonymous"
                    onError={() => markBroken(b.id)}
                  />
                ) : (
                  <img
                    className="sb-media"
                    src={src}
                    alt={b.title ?? ''}
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
