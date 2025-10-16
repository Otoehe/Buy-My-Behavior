import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://eghrvmxhjlnexdtjmqmb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnaHJ2bXhoamxuZXhkdGptcW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwMjMwNjAsImV4cCI6MjA2NjU5OTA2MH0.q7jkIq8hHHdV04gfb18NaaJF35F166TB8Xjy7veed_s'; // 🔐 замініть на свій anon key
const supabase = createClient(supabaseUrl, supabaseKey);

const KYCForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.from('referrals').insert([{
      invitee_email: email,
      referral_code: referralCode,
      used_at: new Date().toISOString(),
      is_successful: false,
      bonus_sent: false
    }]);

    if (error) {
      console.error('Помилка збереження:', error.message);
      setError('Помилка збереження: ' + error.message);
    } else {
      navigate('/profile');
    }
  };

  return (
    <div style={{ backgroundColor: '#f6f6f6', minHeight: '100vh', padding: '3rem' }}>
      <form onSubmit={handleSubmit} style={{
        backgroundColor: '#fff',
        maxWidth: '400px',
        margin: 'auto',
        padding: '2rem',
        borderRadius: '12px',
        boxShadow: '0 0 10px rgba(0,0,0,0.05)'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Реєстрація</h2>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Ваша електронна пошта"
          required
          style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '8px', border: '1px solid #ccc' }}
        />

        <input
          type="text"
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value)}
          placeholder="Промокод (необов’язково)"
          style={{ width: '100%', padding: '0.75rem', marginBottom: '1.5rem', borderRadius: '8px', border: '1px solid #ccc' }}
        />

        <button type="submit" style={{
          width: '100%',
          padding: '1rem',
          backgroundColor: '#000',
          color: '#fff',
          border: 'none',
          borderRadius: '50px',
          fontSize: '1.1rem',
          cursor: 'pointer'
        }}>
          Реєстрація / Вхід
        </button>

        {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
      </form>
    </div>
  );
};

export default KYCForm;
