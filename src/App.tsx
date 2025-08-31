// src/App.tsx
import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

import BehaviorsFeed   from './components/BehaviorsFeed';
import NavigationBar   from './components/NavigationBar';
import Register        from './components/Register';
import Profile         from './components/Profile';
import AuthCallback    from './components/AuthCallback';
import A2HS            from './components/A2HS';
// import AuthAutoCapture from './components/AuthAutoCapture'; // залишаю як було (вимкнено/увімкнено — за вашим станом)

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
// Guards
// ───────────────────────────────────────────────────────────────────────────────
function RequireAuth({ user, children }: { user: User | null; children: React.ReactElement }) {
  if (!user) return <Navigate to="/register" replace />;
  return children;
}

function RedirectIfAuthed({ user, children }: { user: User | null; children: React.ReactElement }) {
  if (user) return <Navigate to="/map" replace />;
  return children;
}

/** Домашня: тепер завжди ведемо на публічну карту */
function HomeGate() {
  return <Navigate to="/map" replace />;
}

export default function App() {
  useViewportVH();
  useGlobalImageHints();

  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
    });

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

      <NavigationBar />

      <Suspense fallback={null}>
        <Routes>
          {/* Домашня сторінка → публічна карта */}
          <Route path="/" element={<HomeGate />} />

          {/* Публічні */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/map"        element={<MapView />} />
          <Route path="/behaviors"  element={<BehaviorsFeed />} />
          <Route path="/manifest"   element={<Manifest />} />

          {/* Реєстрація: відкрита, але якщо вже залогінений — перенаправляємо на карту.
              Перевірка реф-слова відбувається всередині Register.tsx (як і було). */}
          <Route
            path="/register"
            element={
              <RedirectIfAuthed user={user}>
                <Register />
              </RedirectIfAuthed>
            }
          />

          {/* Приватні (особисті дії/дані) */}
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
