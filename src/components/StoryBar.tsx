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
  title: string | null;                 // показуємо як підпис, якщо є
  description: string | null;
  ipfs_cid: string | null;
  file_url?: string | null;            // fallback-джерело
  created_at: string;
  is_dispute_evidence?: boolean | null; // помітка для спору
  dispute_id?: string | null;           // для навігації у спір
}

export default function StoryBar() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();

  // Гаттери по краях
  const SIDE_GUTTER = 'clamp(12px, 2.5vw, 24px)';
  // Невеликі вертикальні паддінги всередині, щоб вмістився бейдж і підпис
  const PAD_TOP = '10px';
  const PAD_BOTTOM = '12px'; // трохи більше знизу під потенційний підпис

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

  // Карточка сторі: кружечок + (опційний) підпис
  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',        // відстань між кружечком і підписом
    width: 'max-content',
  };

  const captionStyle: React.CSSProperties = {
    maxWidth: 'var(--story-size, 64px)',
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
        // ✅ тонкі білі лінії зверху/знизу + компактні вертикальні відступи
        style={{
          borderTop: '6px solid #fff',
          borderBottom: '6px solid #fff',
          background: 'transparent', // не робимо суцільну білу смугу
          paddingTop: `max(${PAD_TOP}, env(safe-area-inset-top))`,
          paddingBottom: `max(${PAD_BOTTOM}, env(safe-area-inset-bottom))`,
          // гаттери зліва/праворуч
          paddingLeft: `max(${SIDE_GUTTER}, env(safe-area-inset-left))`,
          paddingRight: `max(${SIDE_GUTTER}, env(safe-area-inset-right))`,
          scrollPaddingLeft: `max(${SIDE_GUTTER}, env(safe-area-inset-left))`,
          scrollPaddingRight: `max(${SIDE_GUTTER}, env(safe-area-inset-right))`,
          // зовнішні марджини не потрібні — відділення роблять білі лінії
          marginTop: 0,
          marginBottom: 0,
        }}
      >
        {/* Add button як картка (без підпису) */}
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
              {/* Підпис показуємо ТІЛЬКИ якщо є title — без порожньої висоти */}
              {b.title && <div style={captionStyle}>{b.title}</div>}
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
