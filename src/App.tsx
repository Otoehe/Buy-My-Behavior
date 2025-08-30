// src/App.tsx
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';

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

// Ліниві сторінки
const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));

/**
 * Guard: чекає на гідратацію сесії Supabase, не редіректить
 * на /register, поки статус "checking". Є фолбек 5с.
 */
function RequireAuth({ children }: { children: JSX.Element }) {
  const [status, setStatus] = useState<'checking' | 'authed' | 'guest'>('checking');

  useEffect(() => {
    let alive = true;
    let unsub: { unsubscribe(): void } | undefined;

    (async () => {
      // 1) спроба одразу прочитати поточну сесію
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (session) setStatus('authed');

      // 2) слухаємо лише корисні події
      const { data } = supabase.auth.onAuthStateChange((event, sess) => {
        if (!alive) return;
        if (event === 'SIGNED_IN' && sess) setStatus('authed');
        else if (event === 'SIGNED_OUT') setStatus('guest');
        else if (event === 'INITIAL_SESSION' && sess) setStatus('authed'); // тільки якщо сесія вже є
      });
      unsub = data.subscription;
    })();

    // 3) фолбек: якщо за 5с сесії немає — вважаємо гостем
    const fallback = setTimeout(() => {
      if (alive && status === 'checking') setStatus('guest');
    }, 5000);

    return () => {
      alive = false;
      clearTimeout(fallback);
      unsub?.unsubscribe();
    };
  }, []); // навмисно без залежностей

  if (status === 'checking') {
    return <div style={{ padding: '1rem' }}>Завантаження…</div>;
  }
  if (status === 'guest') {
    return <Navigate to="/register" replace />;
  }
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
          <Route path="/map"          element={<RequireAuth><MapView /></RequireAuth>} />
          <Route path="/profile"      element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/my-orders"    element={<RequireAuth><MyOrders /></RequireAuth>} />
          <Route path="/received"     element={<RequireAuth><ReceivedScenarios /></RequireAuth>} />
          <Route path="/scenario/new" element={<RequireAuth><ScenarioForm /></RequireAuth>} />
          <Route path="/manifest"     element={<RequireAuth><Manifest /></RequireAuth>} />

          {/* За замовчуванням */}
          <Route path="/"  element={<Navigate to="/map" replace />} />
          <Route path="*"  element={<Navigate to="/map" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
