import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { NFTStorage, File } from 'nft.storage';
import BehaviorViewer from './BehaviorViewer';
import './StoryBar.css';

/**
 * ВАЖЛИВО: не тримай токени у коді. Краще використовуй змінну середовища:
 * const client = new NFTStorage({ token: import.meta.env.VITE_NFT_STORAGE_TOKEN! });
 * Тут лишаю як є, щоб у тебе «з коробки» запрацювало — заміни на env коли зручно.
 */
const client = new NFTStorage({ token: 'd722a8ef.a32a08895649d958b86fe69bd2ffbe6' });

type StoryProfile = {
  user_id: string;
  avatar_url: string | null;
  story_url: string | null;   // може бути відео або зображення
  name: string | null;
};

const isVideo = (url?: string | null) => {
  if (!url) return false;
  const u = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v)$/.test(u);
};

const StoryBar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profiles, setProfiles] = useState<StoryProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      await getCurrentUser();
      await fetchStories();
      setupLazyVideoObserver();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

  const fetchStories = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, avatar_url, story_url, name')
      .not('story_url', 'is', null);  // показуємо лише тих, у кого є сторі

    if (error) {
      console.error('supabase error:', error);
      setProfiles([]);
      return;
    }
    setProfiles((data as StoryProfile[]) || []);
  };

  /** відкриваємо файл-пікер */
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  /** завантаження відео у NFT.Storage → збереження URL у profiles.story_url */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 30 * 1024 * 1024 || !currentUserId) {
      console.warn('Файл відсутній/занадто великий, або користувач не авторизований');
      return;
    }

    try {
      const blobFile = new File([file], file.name, { type: file.type });
      const cid = await client.storeBlob(blobFile);
      const url = `https://ipfs.io/ipfs/${cid}`;

      const { error } = await supabase
        .from('profiles')
        .update({ story_url: url })
        .eq('user_id', currentUserId);

      if (error) {
        console.error('Помилка оновлення профілю:', error);
        return;
      }

      // очистка інпуту, перезавантаження списку, відкриваємо в’ювер
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchStories();
      setViewerOpen(true);
    } catch (err) {
      console.error('Помилка збереження до IPFS:', err);
    }
  };

  /** Ледачий play/pause відео всередині сторісбару */
  const setupLazyVideoObserver = () => {
    if (!('IntersectionObserver' in window)) return;

    const root = document.querySelector<HTMLDivElement>('.story-bar');
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) {
            v.play().catch(() => {});
          } else {
            v.pause();
          }
        });
      },
      { root, threshold: 0.6 }
    );

    // підв’язуємо всі поточні відео
    const bind = () =>
      document
        .querySelectorAll<HTMLVideoElement>('.story-full-tile .story-media')
        .forEach((v) => io.observe(v));

    bind();

    // невеличкий MutationObserver, щоб підчіпити відео після оновлення списку
    const mo = new MutationObserver(() => bind());
    mo.observe(root, { childList: true, subtree: true });

    // при розмонтуванні (хоч ми й на top-level), звільняємо
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  };

  return (
    <>
      <div className="story-bar">
        {/* Кнопка «+» */}
        <div className="story-item add-button" onClick={handleUploadClick} role="button" title="Додати сторіс">
          <div className="story-full-tile" tabIndex={0}>
            <span className="plus">+</span>
          </div>
          <div className="story-label">Біхейверс</div>
        </div>

        {/* Профілі зі сторісами */}
        {profiles.map((p) => {
          const preview = p.story_url || p.avatar_url || '';
          const showVideo = isVideo(preview);

          return (
            <div className="story-item" key={p.user_id} onClick={() => setViewerOpen(true)} role="button" title={p.name || 'Переглянути'}>
              <div
                className="story-full-tile"
                // якщо картинка — рендеримо background-image
                style={!showVideo && preview ? { backgroundImage: `url(${preview})` } : undefined}
                tabIndex={0}
              >
                {/* якщо відео — рендеримо <video> усередині кружка */}
                {showVideo && (
                  <video
                    className="story-media"
                    src={`${preview}#t=0.001`}
                    preload="metadata"
                    muted
                    playsInline
                    loop
                    onError={(e) => {
                      // fallback на аватар, якщо відео не відтворилось
                      const el = e.currentTarget;
                      const fallback = p.avatar_url
                        ? `url(${p.avatar_url})`
                        : undefined;
                      if (fallback) {
                        const parent = el.parentElement as HTMLDivElement;
                        parent.style.backgroundImage = fallback;
                      }
                      el.remove();
                    }}
                  />
                )}
              </div>
              <div className="story-label">{p.name || 'Користувач'}</div>
            </div>
          );
        })}

        {/* прихований інпут для завантаження */}
        <input
          type="file"
          accept="video/mp4,video/webm,video/ogg,video/quicktime"
          style={{ display: 'none' }}
          ref={fileInputRef}
          onChange={handleFileChange}
        />
      </div>

      {/* В’ювер (як у тебе) */}
      {viewerOpen && <BehaviorViewer storyUsers={profiles} onClose={() => setViewerOpen(false)} />}
    </>
  );
};

export default StoryBar;
