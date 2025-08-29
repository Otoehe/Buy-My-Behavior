// src/App.tsx
import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';

import BehaviorsFeed   from './components/BehaviorsFeed';
import NavigationBar   from './components/NavigationBar';
import Register        from './components/Register';
import Profile         from './components/Profile';
import AuthCallback    from './components/AuthCallback';
import A2HS            from './components/A2HS';
import AuthAutoCapture from './components/AuthAutoCapture';

import useViewportVH        from './lib/useViewportVH';
import useGlobalImageHints  from './lib/useGlobalImageHints';
import NetworkToast         from './components/NetworkToast';
import SWUpdateToast        from './components/SWUpdateToast';

// Нові guard/банер залишаємо (якщо вони у вас є)
import PwaLaunchGuard from './components/PwaLaunchGuard';
import InAppOpenInBrowserBanner from './components/InAppOpenInBrowserBanner';

const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const [ready, setReady]   = useState(false);
  const [authed, setAuthed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAuthed(!!session);
      setReady(true);
    })();
  }, [location.pathname]);

  if (!ready) return <div style={{ padding: '1rem' }}>Завантаження…</div>;
  if (!authed) return <Navigate to="/register" replace />;

  return children;
}

export default function App() {
  useViewportVH();
  useGlobalImageHints();

  return (
    <>
      <AuthAutoCapture />
      <PwaLaunchGuard />
      <InAppOpenInBrowserBanner />

      <NavigationBar />
      <A2HS />
      <NetworkToast />
      <SWUpdateToast />

      <Suspense fallback={<div style={{ padding: '1rem' }}>Завантаження…</div>}>
        <Routes>
          {/* Колбек від magic link / OAuth */}
          <Route path="/auth/callback" element={<AuthCallback next="/map" />} />

          {/* Публічні */}
          <Route path="/register" element={<Register />} />
          <Route path="/behaviors" element={<BehaviorsFeed />} />

          {/* Протектед-роути */}
          <Route
            path="/map"
            element={
              <RequireAuth>
                <MapView />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/my-orders"
            element={
              <RequireAuth>
                <MyOrders />
              </RequireAuth>
            }
          />
          <Route
            path="/received"
            element={
              <RequireAuth>
                <ReceivedScenarios />
              </RequireAuth>
            }
          />
          <Route
            path="/scenario/new"
            element={
              <RequireAuth>
                <ScenarioForm />
              </RequireAuth>
            }
          />
          <Route
            path="/manifest"
            element={
              <RequireAuth>
                <Manifest />
              </RequireAuth>
            }
          />

          {/* За замовчуванням: ведемо на мапу (RequireAuth підстрахує) */}
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
