import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { hardenAuthStorage } from './lib/hardenAuth';

import BehaviorsFeed        from './components/BehaviorsFeed';
import NavigationBar        from './components/NavigationBar';
import Register             from './components/Register';
import Profile              from './components/Profile';
import AuthCallback         from './components/AuthCallback';
import A2HS                 from './components/A2HS';
import useViewportVH        from './lib/useViewportVH';
import useGlobalImageHints  from './lib/useGlobalImageHints';
import NetworkToast         from './components/NetworkToast';
import SWUpdateToast        from './components/SWUpdateToast';

// Захистимо токени від випадкових clear()
hardenAuthStorage();

// Ліниві сторінки
const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));

/**
 * Guard: терпляче чекає гідратацію сесії, дебаунсить SIGNED_OUT,
 * і НЕ редіректить на /register передчасно.
 */
function RequireAuth({ children }: { children: JSX.Element }) {
  const [status, setStatus] = useState<'checking' | 'authed' | 'guest'>('checking');
  const signoutTimer = useRef<number | null>(null);
  const fallbackTimer = useRef<number | null>(null);
  const decidedRef = useRef(false);

  const hasSbToken = () =>
    typeof window !== 'undefined' &&
    Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));

  const decide = (s: 'authed' | 'guest') => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    if (signoutTimer.current) { clearTimeout(signoutTimer.current); signoutTimer.current = null; }
    if (fallbackTimer.current) { clearTimeout(fallbackTimer.current); fallbackTimer.current = null; }
    setStatus(s);
  };

  useEffect(() => {
    let alive = true;
    let unsub: { unsubscribe(): void } | undefined;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (session?.user) setStatus('authed'); else setStatus('checking');

      // слухаємо зміни
      const { data } = supabase.auth.onAuthStateChange((event, sess) => {
        if (!alive) return;

        if (event === 'SIGNED_IN' && sess?.user) {
          decide('authed');
          return;
        }
        if (event === 'SIGNED_OUT') {
          // дебаунсим на 2.5с — перевіримо, чи не "хибний" вихід
          if (signoutTimer.current) clearTimeout(signoutTimer.current);
          signoutTimer.current = window.setTimeout(async () => {
            if (!alive || decidedRef.current) return;
            const { data: { session: s2 } } = await supabase.auth.getSession();
            if (s2?.user || hasSbToken()) return; // токени є — ігноруємо
            decide('guest');
          }, 2500) as unknown as number;
          return;
        }
        if (event === 'INITIAL_SESSION' && sess?.user) {
          decide('authed');
          return;
        }
      });
      unsub = data.subscription;
    })();

    // Щедрий фолбек 6с: якщо сесія не зʼявилась — гостем
    fallbackTimer.current = window.setTimeout(async () => {
      if (decidedRef.current) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) decide('authed'); else decide('guest');
    }, 6000) as unknown as number;

    return () => {
      alive = false;
      unsub?.unsubscribe();
      if (signoutTimer.current) clearTimeout(signoutTimer.current);
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, []);

  if (status === 'checking') return <div style={{ padding: '1rem' }}>Завантаження…</div>;
  if (status === 'guest')    return <Navigate to="/register" replace />;
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
          {/* Колбек після Magic Link / OAuth */}
          <Route path="/auth/callback" element={<AuthCallback next="/map" />} />

          {/* Публічні */}
          <Route path="/register"  element={<Register />} />
          <Route path="/behaviors" element={<BehaviorsFeed />} />

          {/* Захищені */}
          <Route path="/map"           element={<RequireAuth><MapView /></RequireAuth>} />
          <Route path="/profile"       element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/my-orders"     element={<RequireAuth><MyOrders /></RequireAuth>} />
          <Route path="/received"      element={<RequireAuth><ReceivedScenarios /></RequireAuth>} />
          <Route path="/scenario/new"  element={<RequireAuth><ScenarioForm /></RequireAuth>} />
          <Route path="/manifest"      element={<RequireAuth><Manifest /></RequireAuth>} />

          {/* За замовчуванням */}
          <Route path="/"  element={<Navigate to="/map" replace />} />
          <Route path="*"  element={<Navigate to="/map" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
