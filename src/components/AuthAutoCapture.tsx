// src/components/AuthAutoCapture.tsx
import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Мінімізований авто-редірект:
 *  • НЕ редіректимо під час першого рендера (щоб не було гонки з RequireAuth).
 *  • Редіректимо ТІЛЬКИ на подію SIGNED_IN.
 *  • Поважаємо post_auth_next (за замовчуванням /map).
 */
export default function AuthAutoCapture() {
  const navigate = useNavigate();
  const location = useLocation();
  const didRedirect = useRef(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && !didRedirect.current) {
        didRedirect.current = true;
        const next = localStorage.getItem('post_auth_next') || '/map';
        if (location.pathname !== next) {
          navigate(next, { replace: true });
        }
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  return null;
}
