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
  title: string | null;                // ⬅️ будемо показувати як підпис (якщо є)
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

  // мобайл-фьорст «бічний відступ»
  const SIDE_GUTTER = 'clamp(12px, 2.5vw, 24px)';
  // вертикальні відступи: достатньо місця для жовтого бейджа зверху і підпису знизу
  const VERTICAL_PAD = 'clamp(12px, 2.2vw, 18px)';     // внутрішні відступи бару
  const VERTICAL_MARGIN = 'clamp(6px, 1.2vw, 12px)';   // зовнішній «просвіт» бару
  // інтервал між кружечком і підписом
  const CAPTION_GAP = '6px';

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

  // універсальний стиль картки (кружок + підпис)
  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: CAPTION_GAP,
    width: 'max-content',
  };

  // стиль підпису під кружечком
  const captionStyle: React.CSSProperties = {
    maxWidth: 'var(--story-size)',
    fontSize: '12px',
    lineHeight: 1,
    color: '#000',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <>
      <div
        className="story-bar"
        onClick={(e) => e.stopPropagation()}
        // ✅ Стилі: білий фон (щоб «чорні лінії» були білі), вертикальні + горизонтальні відступи
        style={{
          background: '#fff',
          // горизонтальні гаттери
          paddingLeft: `max(${SIDE_GUTTER}, env(safe-area-inset-left))`,
          paddingRight: `max(${SIDE_GUTTER}, env(safe-area-inset-right))`,
          scrollPaddingLeft: `max(${SIDE_GUTTER}, env(safe-area-inset-left))`,
          scrollPaddingRight: `max(${SIDE_GUTTER}, env(safe-area-inset-right))`,
          // вертикальні відступи всередині бару (місце для жовтого кружечка та підпису)
          paddingTop: `max(${VERTICAL_PAD}, env(safe-area-inset-top))`,
          paddingBottom: `max(${VERTICAL_PAD}, env(safe-area-inset-bottom))`,
          // «просвіт» зверху/знизу, щоб бар не прилипав до навбару/карти
          marginTop: VERTICAL_MARGIN,
          marginBottom: VERTICAL_MARGIN,
        }}
      >
        {/* Add button as a card (опційний підпис можна додати пізніше) */}
        <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="story-item add-button"
            onClick={(e) => { e.stopPropagation(); setIsUploadOpen(true); }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Додати Behavior"
            title="Додати Behavior"
          >
            ＋
          </button>
          {/* за потреби можна показати підпис «Додати» */}
          {/* <div style={captionStyle}>Додати</div> */}
        </div>

        {behaviors.map((b) => {
          const go = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (b.is_dispute_evidence && b.dispute_id) {
              navigate(`/behaviors?dispute=${b.dispute_id}`);
            } else {
              openFeed();
            }
          };
          return (
            <div key={b.id} style={cardStyle} onClick={go} title={b.description || undefined}>
              <div className="story-item" aria-label={b.title ?? 'Behavior'}>
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
              {/* Підпис під кружечком (ім’я/титул). Поки що показуємо title, якщо є. */}
              {b.title ? <div style={captionStyle}>{b.title}</div> : <div style={captionStyle} />}
            </div>
          );
        })}
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
