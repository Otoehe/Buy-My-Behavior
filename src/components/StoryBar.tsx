// 📄 src/components/StoryBar.tsx — Behaviors як Stories (INSERT-only)
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import UploadBehavior from './UploadBehavior';
import './StoryBar.css';
import DisputeBadge from './DisputeBadge';

interface Behavior {
  id: number;
  user_id: string | null;
  title: string | null;
  description: string | null;
  ipfs_cid: string | null;
  file_url?: string | null;            // fallback-джерело
  created_at: string;
  is_dispute_evidence?: boolean | null; // помітка для спору
  dispute_id?: string | null;           // ⬅️ для навігації у спір
}

export default function StoryBar() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();

  // мобайл-фьорст «бічний відступ» (не лізе в логіку, лише стилі)
  const SIDE_GUTTER = 'clamp(12px, 2.5vw, 24px)';
  // ✅ вертикальні відступи, щоб кружечки не прилипали ні до навбару, ні до карти
  const VERTICAL_PAD = 'clamp(10px, 1.8vw, 16px)';     // внутрішні відступи бару
  const VERTICAL_MARGIN = 'clamp(6px, 1.2vw, 12px)';   // зовнішній «просвіт» бару від сусідів

  const fetchBehaviors = async () => {
    const { data, error } = await supabase
      .from('behaviors')
      .select('id,user_id,title,description,ipfs_cid,file_url,created_at,is_dispute_evidence,dispute_id')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Failed to fetch behaviors:', error);
      return;
    }
    setBehaviors((data || []).map((b: any) => ({
      ...b,
      is_dispute_evidence: !!b.is_dispute_evidence,
    })));
  };

  useEffect(() => {
    fetchBehaviors();

    const subscription = supabase
      .channel('realtime:behaviors')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'behaviors' },
        () => fetchBehaviors()
      )
      .subscribe();

    const openHandler = () => setIsUploadOpen(true);
    window.addEventListener('behaviorUploaded', fetchBehaviors);
    window.addEventListener('openUploadModal', openHandler);

    return () => {
      supabase.removeChannel(subscription);
      window.removeEventListener('behaviorUploaded', fetchBehaviors);
      window.removeEventListener('openUploadModal', openHandler);
    };
  }, []);

  const openFeed = () => navigate('/behaviors');

  // Якщо ipfs_cid порожній, беремо file_url
  const resolveSrc = (b: Behavior) =>
    b.ipfs_cid ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}` : (b.file_url || '');

  return (
    <>
      <div
        className="story-bar"
        onClick={(e) => e.stopPropagation()}
        // ✅ лише стилі: додаємо бічні та вертикальні відступи, враховуємо safe-area
        style={{
          // горизонтальні гаттери
          paddingLeft: `max(${SIDE_GUTTER}, env(safe-area-inset-left))`,
          paddingRight: `max(${SIDE_GUTTER}, env(safe-area-inset-right))`,
          scrollPaddingLeft: `max(${SIDE_GUTTER}, env(safe-area-inset-left))`,
          scrollPaddingRight: `max(${SIDE_GUTTER}, env(safe-area-inset-right))`,

          // 🔝🔻 вертикальні відступи всередині бару
          paddingTop: `max(${VERTICAL_PAD}, env(safe-area-inset-top))`,
          paddingBottom: `max(${VERTICAL_PAD}, env(safe-area-inset-bottom))`,

          // «просвіт» зверху/знизу, щоб бар не прилипав до навбару/карти
          marginTop: VERTICAL_MARGIN,
          marginBottom: VERTICAL_MARGIN,
        }}
      >
        <button
          type="button"
          className="story-item add-button"
          onClick={(e) => { e.stopPropagation(); setIsUploadOpen(true); }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Додати Behavior"
        >
          ＋
        </button>

        {behaviors.map((b) => (
          <div
            key={b.id}
            className="story-item"
            onClick={(e) => {
              e.stopPropagation();
              if (b.is_dispute_evidence && b.dispute_id) {
                navigate(`/behaviors?dispute=${b.dispute_id}`);
              } else {
                openFeed();
              }
            }}
            title={b.description || undefined}
          >
            <video
              src={resolveSrc(b)}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onEnded={(e) => { const v = e.currentTarget; v.currentTime = 0; v.play(); }}
              className="story-video"
            />
            <DisputeBadge show={b.is_dispute_evidence} />
          </div>
        ))}
      </div>

      {isUploadOpen && (
        <UploadBehavior onClose={() => setIsUploadOpen(false)}>
          <div className="upload-hint">
            📦 <strong>Увага:</strong> розмір Behavior не повинен перевищувати <strong>30MB</strong>
          </div>
        </UploadBehavior>
      )}
    </>
  );
}
