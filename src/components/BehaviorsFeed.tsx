import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './BehaviorsFeed.css';
import './Icons.css';
import ShareModal from './ShareModal';
import DisputeVoteWidget from './DisputeVoteWidget';

interface Behavior {
  id: number;
  ipfs_cid: string;
  thumbnail_url?: string;
  description?: string;
  created_at?: string;
  dispute_id?: string | null;
  author_id?: string;
  author_avatar_url?: string;
  user_id?: string;
  likes_count?: number;
  dislikes_count?: number;
}

const BehaviorsFeed: React.FC = () => {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string>('');
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBehaviors = async () => {
      const { data, error } = await supabase
        .from('behaviors')
        .select(`*, profiles:author_id(avatar_url)`)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const processed = data.map((b: any) => ({
          ...b,
          author_avatar_url: b.profiles?.avatar_url || '',
          likes_count: b.likes_count || 0,
          dislikes_count: b.dislikes_count || 0,
        })) as Behavior[];
        setBehaviors(processed);
      } else {
        console.error('Помилка при завантаженні поведінок:', error);
      }
    };
    fetchBehaviors();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLVideoElement;
          const id = target.dataset.id;
          if (id && entry.isIntersecting) setActiveVideoId(id);
        });
      },
      { threshold: 0.9 }
    );
    Object.values(videoRefs.current).forEach((video) => video && observer.observe(video));
    return () => observer.disconnect();
  }, [behaviors]);

  useEffect(() => {
    Object.values(videoRefs.current).forEach((video) => {
      if (!video) return;
      if (video.dataset.id === activeVideoId) {
        video.muted = false;
        video.play().catch(() => {});
      } else {
        video.pause();
        video.muted = true;
      }
    });
  }, [activeVideoId]);

  const ensureAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) { alert('Потрібно увійти'); return null; }
    return user.id;
  };

  const handleLike = async (behaviorId: number) => {
    const userId = await ensureAuth(); if (!userId) return;
    const { data: existing } = await supabase
      .from('likes')
      .select('*')
      .eq('behavior_id', behaviorId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) return;

    const { error } = await supabase.from('likes').insert({ behavior_id: behaviorId, user_id: userId, is_like: true });
    if (!error) setBehaviors((prev) => prev.map((b) => b.id === behaviorId ? { ...b, likes_count: (b.likes_count ?? 0) + 1 } : b));
  };

  const handleDislike = async (behaviorId: number) => {
    const userId = await ensureAuth(); if (!userId) return;
    const { data: existing } = await supabase
      .from('likes')
      .select('*')
      .eq('behavior_id', behaviorId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) return;

    const { error } = await supabase.from('likes').insert({ behavior_id: behaviorId, user_id: userId, is_like: false });
    if (!error) setBehaviors((prev) => prev.map((b) => b.id === behaviorId ? { ...b, dislikes_count: (b.dislikes_count ?? 0) + 1 } : b));
  };

  const handleAuthorClick = (authorId?: string) => {
    if (authorId) navigate(`/map`, { state: { profile: authorId } });
  };

  return (
    <div className="shorts-container">
      {behaviors.map((behavior) => (
        <div key={behavior.id} className="shorts-item">
          <div className="shorts-video-wrapper">
            <video
              data-id={String(behavior.id)}
              ref={(el) => (videoRefs.current[behavior.id] = el)}
              className="shorts-video"
              src={`https://gateway.lighthouse.storage/ipfs/${behavior.ipfs_cid}`}
              autoPlay
              loop
              muted
              playsInline
              controls={false}
            />

            {!!behavior.author_avatar_url && (
              <img
                className="shorts-author-avatar"
                src={behavior.author_avatar_url}
                alt="Author avatar"
                onClick={() => handleAuthorClick(behavior.author_id)}
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}

            <div className="shorts-buttons-panel">
              <button onClick={() => handleLike(behavior.id)} title="Подобається">
                <i className="fa-regular fa-heart"></i>
                <span>{behavior.likes_count ?? 0}</span>
              </button>
              <button onClick={() => handleDislike(behavior.id)} title="Не подобається">
                <i className="fa-regular fa-thumbs-down"></i>
                <span>{behavior.dislikes_count ?? 0}</span>
              </button>
              <button
                onClick={() => setShareUrl(`https://gateway.lighthouse.storage/ipfs/${behavior.ipfs_cid}`)}
                title="Поділитись"
              >
                <i className="fa-solid fa-share-nodes"></i>
              </button>
            </div>
          </div>

          {behavior.dispute_id && (
            <div style={{ marginTop: 8 }}>
              <DisputeVoteWidget disputeId={String(behavior.dispute_id)} />
            </div>
          )}
        </div>
      ))}

      {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
    </div>
  );
};

export default BehaviorsFeed;
