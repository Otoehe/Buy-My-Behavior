// src/App.tsx
import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

import BehaviorsFeed   from './components/BehaviorsFeed';
import NavigationBar   from './components/NavigationBar';
import Register        from './components/Register';
import Profile         from './components/Profile';
import AuthCallback    from './components/AuthCallback';
import A2HS            from './components/A2HS';
// import AuthAutoCapture from './components/AuthAutoCapture';

import useViewportVH        from './lib/useViewportVH';
import useGlobalImageHints  from './lib/useGlobalImageHints';
import NetworkToast         from './components/NetworkToast';
import SWUpdateToast        from './components/SWUpdateToast';

// ⛔️ SplashScreen більше не використовуємо
// import SplashScreen from './components/SplashScreen';

const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));
const ScenarioLocation  = lazy(() => import('./components/ScenarioLocation')); // ✅

// ───────────────────────────────────────────────────────────────────────────────
// Guards
// ───────────────────────────────────────────────────────────────────────────────
function RequireAuth({
  user,
  children,
}: {
  user: User | null | undefined;
  children: React.ReactElement;
}) {
  const location = useLocation();

  // Поки стан авторизації невідомий — нічого (OS/HTML splash уже на екрані)
  if (user === undefined) return null;

  if (user === null) {
    return <Navigate to="/register" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function RedirectIfAuthed({
  user,
  children,
}: {
  user: User | null | undefined;
  children: React.ReactElement;
}) {
  if (user === undefined) return null;
  if (user) return <Navigate to="/map" replace />;
  return children;
}

function HomeGate() {
  return <Navigate to="/map" replace />;
}

/** ✅ Маршрут карти:
 *  Якщо на /map є ?pick=1 & executor_id=… → показуємо селектор локації,
 *  інакше — звичайну карту з виконавцями.
 */
function MapOrSelect() {
  const params = new URLSearchParams(useLocation().search);
  const isPick = params.get('pick') === '1' && !!params.get('executor_id');
  return isPick ? <ScenarioLocation /> : <MapView />;
}

export default function App() {
  useViewportVH();
  useGlobalImageHints();

  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (user === undefined) {
    return null;
  }

  return (
    <>
      <A2HS />
      <NetworkToast />
      <SWUpdateToast />
      <NavigationBar />

      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomeGate />} />

          {/* Публічні сторінки */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/map"          element={<MapOrSelect />} />      {/* ✅ */}
          <Route path="/map/select"   element={<ScenarioLocation />} /> {/* ✅ прямий alias */}
          <Route path="/behaviors"    element={<BehaviorsFeed />} />
          <Route path="/manifest"     element={<Manifest />} />

          {/* Реєстрація */}
          <Route
            path="/register"
            element={
              <RedirectIfAuthed user={user}>
                <Register />
              </RedirectIfAuthed>
            }
          />

          {/* Приватні сторінки */}
          <Route
            path="/profile"
            element={
              <RequireAuth user={user}>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/my-orders"
            element={
              <RequireAuth user={user}>
                <MyOrders />
              </RequireAuth>
            }
          />
          <Route
            path="/received"
            element={
              <RequireAuth user={user}>
                <ReceivedScenarios />
              </RequireAuth>
            }
          />
          <Route
            path="/scenario/new"
            element={
              <RequireAuth user={user}>
                <ScenarioForm />
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
