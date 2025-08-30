import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';

import BehaviorsFeed   from './components/BehaviorsFeed';
import NavigationBar   from './components/NavigationBar';
import Register        from './components/Register';
import Profile         from './components/Profile';
import AuthCallback    from './components/AuthCallback';
import A2HS            from './components/A2HS';
import useViewportVH        from './lib/useViewportVH';
import useGlobalImageHints  from './lib/useGlobalImageHints';
import NetworkToast         from './components/NetworkToast';
import SWUpdateToast        from './components/SWUpdateToast';

const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const [status, setStatus] = useState<'checking' | 'authed' | 'guest'>('checking');

  useEffect(() => {
    let alive = true;
    let decided = false;
    let timer: number | undefined;

    const hasSbToken = () =>
      typeof window !== 'undefined' &&
      Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));

    const decideAuthed = () => {
      if (!alive || decided) return;
      decided = true;
      setStatus('authed');
    };

    const decideGuest = () => {
      if (!alive || decided) return;
      decided = true;
      setStatus('guest');
    };

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;

      if (session?.user) {
        decideAuthed();
      } else {
        // Якщо є sb-* токен у storage — даємо довший grace
        const grace = hasSbToken() ? 4000 : 1800;
        timer = window.setTimeout(async () => {
          const { data: { session: s2 } } = await supabase.auth.getSession();
          if (!alive) return;
          if (s2?.user) decideAuthed();
          else decideGuest();
        }, grace);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!alive) return;
      if (session?.user) {
        if (timer) clearTimeout(timer);
        decideAuthed();
      }
    });

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (status === 'checking') return <div style={{ padding: '1rem' }}>Завантаження…</div>;
  if (status === 'guest')   return <Navigate to="/register" replace />;
  return children;
}

export default function App() {
  useViewportVH();
  useGlobalImageHints();

  return (
    <>
      <NavigationBar />
      <A2HS />
      <NetworkToast />
      <SWUpdateToast />

      <Suspense fallback={<div style={{ padding: '1rem' }}>Завантаження…</div>}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback next="/map" />} />

          {/* Публічні */}
          <Route path="/register"  element={<Register />} />
          <Route path="/behaviors" element={<BehaviorsFeed />} />

          {/* Захищені */}
          <Route path="/map"            element={<RequireAuth><MapView /></RequireAuth>} />
          <Route path="/profile"        element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/my-orders"      element={<RequireAuth><MyOrders /></RequireAuth>} />
          <Route path="/received"       element={<RequireAuth><ReceivedScenarios /></RequireAuth>} />
          <Route path="/scenario/new"   element={<RequireAuth><ScenarioForm /></RequireAuth>} />
          <Route path="/manifest"       element={<RequireAuth><Manifest /></RequireAuth>} />

          {/* За замовчуванням */}
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
