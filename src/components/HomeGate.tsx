import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function HomeGate() {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession(); // читає локально
      setAuthed(!!data.session);
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/map'; // ⬅️ за замовчуванням — /map

  return authed ? <Navigate to={next} replace /> : <Navigate to="/register" replace />;
}
