import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import './BehaviorsList.css';


interface Behavior {
  id: string;
  ipfs_cid: string;
  title: string;
  description: string;
}

export default function BehaviorsList() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);

  useEffect(() => {
    const fetchBehaviors = async () => {
      const { data, error } = await supabase
        .from('behaviors')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Fetch error:', error);
      } else {
        setBehaviors(data);
      }
    };

    fetchBehaviors();
  }, []);

  return (
    <div className="behaviors-list">
      <h2>🎬 Твої Behaviors</h2>

      {behaviors.length === 0 ? (
        <p>Немає жодного завантаженого відео.</p>
      ) : (
        behaviors.map((b) => (
          <div key={b.id} className="behavior-item">
            <h3>{b.title}</h3>
            <p>{b.description}</p>
            <video
              src={`https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}`}
              controls
              width="320"
              height="240"
            />
          </div>
        ))
      )}
    </div>
  );
}
