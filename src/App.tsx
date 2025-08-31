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

const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));

// ───────────────────────────────────────────────────────────────────────────────
// Guards, що враховують "loading" стан (user === undefined)
// ───────────────────────────────────────────────────────────────────────────────
function RequireAuth({
  user,
  children,
}: {
  user: User | null | undefined;
  children: React.ReactElement;
}) {
  const location = useLocation();

  // ⬅️ Поки не знаємо стан авторизації — НІЧОГО не редіректимо
  if (user === undefined) return null; // можна підставити легкий спінер

  if (user === null) {
    // запам'ятаємо, куди хотіли зайти (може знадобитися)
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
  if (user === undefined) return null; // не стрибаємо, поки вантажиться
  if (user) return <Navigate to="/map" replace />;
  return children;
}

/** Домашня: публічна карта */
function HomeGate() {
  return <Navigate to="/map" replace />;
}

export default function App() {
  useViewportVH();
  useGlobalImageHints();

  // ⬅️ undefined = loading, null = неавторизований, User = авторизований
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;

    // 1) швидке отримання сесії (швидше й стабільніше для першого рендера)
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
    });

    // 2) підписка на всі події логіну/логауту
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      <A2HS />
      <NetworkToast />
      <SWUpdateToast />

      {/* NavigationBar не змінюємо */}
      <NavigationBar />

      <Suspense fallback={null}>
        <Routes>
          {/* Домівка → публічна карта */}
          <Route path="/" element={<HomeGate />} />

          {/* Публічні сторінки */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/map"        element={<MapView />} />
          <Route path="/behaviors"  element={<BehaviorsFeed />} />
          <Route path="/manifest"   element={<Manifest />} />

          {/* Реєстрація: відкрита. Якщо вже залогінений — повертаємо на карту. */}
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

          {/* Фолбек */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
