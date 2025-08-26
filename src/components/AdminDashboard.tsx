import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://eghrvmxhjlnexdtjmqmb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnaHJ2bXhoamxuZXhkdGptcW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwMjMwNjAsImV4cCI6MjA2NjU5OTA2MH0.q7jkIq8hHHdV04gfb18NaaJF35F166TB8Xjy7veed_s'; // 🔐 вставте свій анонімний ключ
const supabase = createClient(supabaseUrl, supabaseKey);

const AdminDashboard: React.FC = () => {
  const [referrals, setReferrals] = useState([]);
  const [ambassadors, setAmbassadors] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const { data: refs } = await supabase.from('referrals').select('*');
      const { data: ambs } = await supabase.from('ambassadors').select('*');
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });

      setReferrals(refs || []);
      setAmbassadors(ambs || []);
      setUserCount(count || 0);
      setLoading(false);
    };

    fetchData();
  }, []);

  return (
    <div style={{ padding: '2rem', background: '#f4f4f4', minHeight: '100vh' }}>
      <h1>Адмін-дошка BMB</h1>

      {loading ? (
        <p>Завантаження...</p>
      ) : (
        <>
          <h2>Загальна статистика</h2>
          <ul>
            <li>Зареєстрованих користувачів: {userCount}</li>
            <li>Реферальних записів: {referrals.length}</li>
            <li>Амбасадорів: {ambassadors.length}</li>
          </ul>

          <h2>Реферали</h2>
          <table style={{ width: '100%', background: '#fff', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Код</th>
                <th>Дата</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r: any, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #ccc' }}>
                  <td>{r.invitee_email}</td>
                  <td>{r.referral_code}</td>
                  <td>{new Date(r.used_at).toLocaleString()}</td>
                  <td>{r.is_successful ? '✅' : '⏳'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ marginTop: '2rem' }}>Амбасадори</h2>
          <table style={{ width: '100%', background: '#fff', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Код</th>
                <th>Ім’я</th>
                <th>Гаманець</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {ambassadors.map((a: any, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #ccc' }}>
                  <td>{a.code}</td>
                  <td>{a.name}</td>
                  <td>{a.wallet}</td>
                  <td>{a.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;