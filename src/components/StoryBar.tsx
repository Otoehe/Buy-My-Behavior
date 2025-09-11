// src/components/StoryBar.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import UploadBehavior from './UploadBehavior';
import './StoryBar.css';

type BehaviorRow = {
  id: number;
  ipfs_cid: string | null;
  file_url?: string | null;
  thumbnail_url?: string | null;
  author_avatar_url?: string | null;
  created_at: string;
  is_public: boolean;
  author_id?: string | null;
};

export default function StoryBar() {
  const [items, setItems] = useState<BehaviorRow[]>([]);
  const [openUpload, setOpenUpload] = useState(false);
  const navigate = useNavigate();

  // первинне завантаження
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('behaviors')
        .select('id, ipfs_cid, file_url, thumbnail_url, author_avatar_url, created_at, is_public, author_id')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!mounted) return;
      if (error) console.error(error);
      else setItems((data || []).filter(Boolean) as BehaviorRow[]);
    })();

    // тільки INSERT — канонічно
    const channel = supabase
      .channel('realtime:behaviors:insert')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'behaviors' }, (payload) => {
        const row = payload.new as BehaviorRow;
        setItems(prev => [row, ...prev]);
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="storybar">
      {/* Кнопка «+» — відкриває модалку */}
      <button
        onClick={() => setOpenUpload(true)}
        className="storybar-item add"
        title="Додати"
      >
        +
      </button>

      {/* кружечки історій */}
      {items.map((b) => {
        const src = b.thumbnail_url || b.file_url || (b.ipfs_cid ? `https://ipfs.io/ipfs/${b.ipfs_cid}` : '');
        return (
          <button
            key={b.id}
            onClick={() => navigate('/behaviors')}
            className="storybar-item"
            title="Переглянути"
          >
            {src ? <img src={src} alt="preview" className="thumb" /> : <div className="thumb placeholder" />}
          </button>
        );
      })}

      {/* Модалка: повністю керується цим станом */}
      <UploadBehavior
        isOpen={openUpload}
        onClose={() => setOpenUpload(false)}
      />
    </div>
  );
}
