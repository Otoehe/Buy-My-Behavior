// src/components/AuthAutoCapture.tsx
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Автоматично реагує на зміну стану авторизації:
 *  - після SIGNED_IN веде на /map (або на те, що лежить у localStorage.post_auth_next)
 *  - при першому рендері, якщо сесія вже існує, теж веде на /map
 */
export default function AuthAutoCapture() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const goNext = () => {
      const next = localStorage.getItem('post_auth_next') || '/map';
      // уникаємо зайвих редіректів, якщо вже там
      if (isMounted && location.pathname !== next) {
        navigate(next, { replace: true });
      }
    };

    // 1) якщо сесія вже є — перенаправляємо
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) goNext();
    });

    // 2) слухаємо зміни
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        goNext();
      }
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  return null;
}
