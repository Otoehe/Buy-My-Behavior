// src/components/Register.tsx
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const Register = () => {
  const [email, setEmail] = useState('');
  const [promo, setPromo] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: 'http://localhost:5173/profile', // Або Ваш продакшн-URL
      },
    });

    if (error) {
      setMessage('❌ Помилка: ' + error.message);
    } else {
      setMessage('✅ Лист з магічним посиланням надіслано на ' + email);
    }

    setLoading(false);
  };

  return (
    <div className="register-container" style={{ padding: '2rem' }}>
      <h2>Реєстрація</h2>
      <form onSubmit={handleRegister} style={{ maxWidth: '400px', margin: 'auto' }}>
        <input
          type="email"
          placeholder="Ваша електронна пошта"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
        />
        <input
          type="text"
          placeholder="Промокод (необов’язково)"
          value={promo}
          onChange={(e) => setPromo(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: 'black',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Надсилаємо...' : 'Реєстрація / Вхід'}
        </button>
        {message && <p style={{ marginTop: '1rem' }}>{message}</p>}
      </form>
    </div>
  );
};

export default function RegisterBackup() { ... }

