// 📄 src/components/StoryBar.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import BehaviorViewer from './BehaviorViewer';
import './StoryBar.css';

interface Behavior {
  id: number;
  title: string;
  ipfs_cid: string;
  created_at: string;
}

export default function StoryBar() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [viewerStories, setViewerStories] = useState<{ story_url: string; name: string }[]>([]);
  const [isViewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    const fetchBehaviors = async () => {
      const { data, error } = await supabase
        .from('поведінка')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) {
        setBehaviors(data);
      }
    };
    fetchBehaviors();
  }, []);

  const handleStoryClick = (index: number) => {
    const stories = behaviors.map((b) => ({
      story_url: `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}`,
      name: b.title || 'Без назви',
    }));
    setViewerStories(stories);
    setViewerOpen(true);
  };

  return (
    <div className="story-bar-container">
      <div className="story-bar-scroll">
        {/* Кружечок для додавання нового */}
        <div className="story-circle add-story">+</div>

        {/* Список історій */}
        {behaviors.map((b, index) => (
          <div
            key={b.id}
            className="story-circle"
            onClick={() => handleStoryClick(index)}
          >
            <span className="story-title">{b.title?.slice(0, 2)}</span>
          </div>
        ))}
      </div>

      {isViewerOpen && (
        <BehaviorViewer
          storyUsers={viewerStories}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
