// src/App.tsx
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

// Не підключаємо автогарди/банери, щоб не вносили навігацію під час логіну
// import PwaLaunchGuard from './components/PwaLaunchGuard';
// import InAppOpenInBrowserBanner from './components/InAppOpenInBrowserBanner';

const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const [status, setStatus] = useState<'checking' | 'authed' | 'guest'>('checking');

  useEffect(() => {
    let alive = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'INITIAL_SESSION') {
        setStatus(session ? 'authed' : 'guest');
      } else if (event === 'SIGNED_IN') {
        setStatus('authed');
      } else if (event === 'SIGNED_OUT') {
        setStatus('guest');
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
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
      {/* <PwaLaunchGuard /> */}
      {/* <InAppOpenInBrowserBanner /> */}

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
