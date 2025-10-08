// src/components/AuthHandoff.tsx
import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthHandoff() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Після відкриття в MetaMask Browser підхоплюємо чинну сесію
    // і повертаємо користувача на потрібну сторінку (за замовчанням — /my-orders).
    const sp = new URLSearchParams(location.search);
    const next = sp.get('next') || '/my-orders';

    supabase.auth.getSession().finally(() => {
      navigate(next, { replace: true });
    });
  }, [location.search, navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Відкриття у MetaMask…</h2>
      <p>Зачекайте, виконуємо перенаправлення. Якщо нічого не відбувається — поверніться «Назад».</p>
    </div>
  );
}
