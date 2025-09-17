import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import './StoryBar.css';

/** Профіль для сторіс */
interface StoryProfile {
  user_id: string;
  avatar_url: string | null;
  story_url: string | null; // може бути фото або відео
  name: string | null;
}

/** Детектор відео за URL */
const isVideo = (url?: string | null) => {
  if (!url) return false;
  const u = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v)$/.test(u);
};

/** Завантаження у IPFS (динамічний імпорт, щоб не ламати білд) */
async function uploadToIPFS(file: File): Promise<string> {
  const token = import.meta.env.VITE_NFT_STORAGE_TOKEN as string | undefined;
  if (!token) {
    throw new Error('Відсутній VITE_NFT_STORAGE_TOKEN');
  }

  // динамічний імпорт — Vite/Rollup не валиться, пакет тягнемо лише у браузері
  const { NFTStorage } = await import('nft.storage');
  const client = new NFTStorage({ token });
  // File — це вже Blob, можна передати напряму
  const cid = await client.storeBlob(file);
  return `https://ipfs.io/ipfs/${cid}`;
}

export default function StoryBar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [storyUsers, setStoryUsers] = useState<StoryProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // ────────────────────────────────────────────────────────────────────
  // initial fetch + current user
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, avatar_url, story_url, name')
        .not('story_url', 'is', null)
        .order('user_id', { ascending: true });

      if (!error && Array.isArray(data)) setStoryUsers(data as StoryProfile[]);
    })();
  }, []);

  // Lazy play/pause для відео прямо у стрічці
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = barRef.current;
    if (!root || !('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        }
      },
      { root, threshold: 0.6 }
    );

    const videos = root.querySelectorAll<HTMLVideoElement>('video[data-sb]');
    videos.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, [storyUsers]);

  // ────────────────────────────────────────────────────────────────────
  // upload flow
  const openUpload = () => fileInputRef.current?.click();

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = async (ev) => {
    try {
      const f = ev.target.files?.[0];
      if (!f) return;
      if (!currentUserId) {
        alert('Увійди у профіль, щоб додати сторіс');
        return;
      }
      if (f.size > 30 * 1024 * 1024) {
        alert('Максимальний розмір — 30MB');
        return;
      }

      // Заливка в IPFS
      const url = await uploadToIPFS(f);

      // Оновлення профілю
      const { error } = await supabase
        .from('profiles')
        .update({ story_url: url })
        .eq('user_id', currentUserId);

      if (error) throw error;

      // refetch (мінімально — локально оновити)
      setStoryUsers((prev) => {
        const me = prev.find((p) => p.user_id === currentUserId);
        if (me) {
          me.story_url = url;
          return [...prev];
        }
        return [{ user_id: currentUserId, avatar_url: null, story_url: url, name: 'Моя історія' }, ...prev];
      });

      // очистити інпут
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      console.error(e);
      alert(`Не вдалося додати сторіс: ${e?.message || e}`);
    }
  };

  // ────────────────────────────────────────────────────────────────────
  // відкриття сторіс (простий приклад — відкрити URL)
  const openStory = (u?: string | null) => {
    if (!u) return;
    // Тут можеш підключити свій переглядач/лайтбокс
    window.open(u, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="story-bar" data-bmb-storybar="">
      <div ref={barRef} className="sb-container sb-hide-scroll">
        {/* Кнопка додавання */}
        <button
          type="button"
          className="sb-item sb-item-add"
          onClick={openUpload}
          aria-label="Додати сторіс"
          title="Додати сторіс"
        >
          <span className="sb-plus">+</span>
        </button>

        {/* Сторіс користувачів */}
        {storyUsers.map((user) => {
          const media = user.story_url || '';
          const asVideo = isVideo(media);

          return (
            <button
              key={user.user_id}
              type="button"
              className="sb-item"
              title={user.name || 'Переглянути'}
              onClick={() => openStory(media)}
            >
              <div className="sb-media">
                {media ? (
                  asVideo ? (
                    <video
                      data-sb
                      className="sb-media"
                      src={media}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onError={(e) => {
                        // Якщо відео не програлося — замінити на фолбек
                        const el = e.currentTarget as HTMLVideoElement;
                        const fb = document.createElement('div');
                        fb.className = 'sb-fallback';
                        el.replaceWith(fb);
                      }}
                    />
                  ) : (
                    <img
                      className="sb-media"
                      src={media}
                      alt={user.name || ''}
                      loading="lazy"
                      decoding="async"
                      crossOrigin="anonymous"
                      onError={(e) => {
                        const el = e.currentTarget;
                        const fb = document.createElement('div');
                        fb.className = 'sb-fallback';
                        el.replaceWith(fb);
                      }}
                    />
                  )
                ) : (
                  <div className="sb-fallback" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* прихований інпут для файлу */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
    </div>
  );
}
