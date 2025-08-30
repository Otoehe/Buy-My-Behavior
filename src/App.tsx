import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';

import BehaviorsFeed from './components/BehaviorsFeed';
import NavigationBar from './components/NavigationBar';
import Register from './components/Register';
import Profile from './components/Profile';
import AuthCallback from './components/AuthCallback';
import A2HS from './components/A2HS';
import useViewportVH from './lib/useViewportVH';
import useGlobalImageHints from './lib/useGlobalImageHints';
import NetworkToast from './components/NetworkToast';
import SWUpdateToast from './components/SWUpdateToast';

// Ліниві екрани
const MapView            = lazy(() => import('./components/MapView'));
const MyOrders           = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios  = lazy(() => import('./components/ReceivedScenarios'));
const Manifest           = lazy(() => import('./components/Manifest'));
const ScenarioForm       = lazy(() => import('./components/ScenarioForm'));

/**
 * Guard: чекає реальну сесію ігноруючи INITIAL_SESSION,
 * дає короткий "grace" щоб magic-link встиг створити сесію.
 */
function RequireAuth({ children }: { children: JSX.Element }) {
  const [status, setStatus] = useState<'checking' | 'authed' | 'guest'>('checking');
  const [grace, setGrace] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setGrace(false), 1200); // невелика затримка під час логіну
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let alive = true;
    let unsub: { unsubscribe: () => void } | undefined;

    (async () => {
      // 1) Спочатку читаємо поточну сесію синхронно
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      setStatus(session ? 'authed' : 'guest');

      // 2) Далі слухаємо лише SIGNED_IN / SIGNED_OUT
      const { data } = supabase.auth.onAuthStateChange((event, sess) => {
        if (!alive) return;
        if (event === 'SIGNED_IN' && sess) setStatus('authed');
        if (event === 'SIGNED_OUT')       setStatus('guest');
        // ВАЖЛИВО: НЕ редіректимо по INITIAL_SESSION — вона часто пуста одразу після magic-link
      });
      unsub = data.subscription;
    })();

    return () => {
      alive = false;
      unsub?.unsubscribe();
    };
  }, []);

  // Поки "checking" або короткий grace для гостя — не редіректимо
  if (status === 'checking' || (status === 'guest' && grace)) {
    return <div style={{ padding: '1rem' }}>Завантаження…</div>;
  }
  if (status === 'guest') return <Navigate to="/register" replace />;
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
