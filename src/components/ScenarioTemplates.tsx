import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const ScenarioTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('scenarios')
        .select('*')
        .eq('owner_id', user.id)
        .is('proposer_id', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Помилка завантаження шаблонів:', error.message);
      }

      if (data) {
        setTemplates(data);
      }

      setLoading(false);
    };

    fetchTemplates();
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Завантаження шаблонів...</div>;
  if (!templates.length) return <div style={{ padding: 16 }}>Шаблонів ще немає.</div>;

  return (
    <div style={{ padding: 16 }}>
      <h4>Шаблони сценаріїв</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {templates.map((s) => (
          <div
            key={s.id}
            style={{
              border: '1px solid #eee',
              padding: 12,
              borderRadius: 8,
              background: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
            }}
          >
            <strong>{s.description}</strong>
            <div style={{ color: '#555' }}>{s.price} USDT</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScenarioTemplates;
