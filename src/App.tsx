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
// Якщо було вимкнено — залишай вимкненим. Коли повернемо — просто розкоментуємо.
// import AuthAutoCapture from './components/AuthAutoCapture';

import useViewportVH        from './lib/useViewportVH';
import useGlobalImageHints  from './lib/useGlobalImageHints';
import NetworkToast         from './components/NetworkToast';
import SWUpdateToast        from './components/SWUpdateToast';

// Ледачі імпорти великих сторінок
const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));

// ───────────────────────────────────────────────────────────────────────────────
// Допоміжні guard-компоненти
// ───────────────────────────────────────────────────────────────────────────────
function RequireAuth({ user, children }: { user: User | null; children: React.ReactElement }) {
  if (!user) return <Navigate to="/register" replace />;
  return children;
}

function RedirectIfAuthed({ user, children }: { user: User | null; children: React.ReactElement }) {
  if (user) return <Navigate to="/map" replace />;
  return children;
}

/**
 * HomeGate — єдина логіка стартової сторінки.
 * Якщо користувач є — ведемо на карту (/map).
 * Якщо ні — на реєстрацію (/register).
 * Таким чином корінь "/" більше не показує BehaviorsFeed.
 */
function HomeGate({ user }: { user: User | null }) {
  return <Navigate to={user ? '/map' : '/register'} replace />;
}

export default function App() {
  // Системні хуки (як і раніше)
  useViewportVH();
  useGlobalImageHints();

  // Стежимо за авторизацією Supabase
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let mounted = true;

    // 1) первинне отримання користувача
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
    });

    // 2) підписка на зміни сесії
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
      {/* PWA/мережеві дрібниці — без змін */}
      <A2HS />
      <NetworkToast />
      <SWUpdateToast />

      {/* Навбар НЕ чіпаємо */}
      <NavigationBar />

      {/* Маршрутизація */}
      <Suspense fallback={null}>
        <Routes>
          {/* Домашній вхід за адресою сайту */}
          <Route path="/" element={<HomeGate user={user} />} />

          {/* Публічні сторінки */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/behaviors" element={<BehaviorsFeed />} />

          {/* Реєстрація доступна лише неавторизованим */}
          <Route
            path="/register"
            element={
              <RedirectIfAuthed user={user}>
                <Register />
              </RedirectIfAuthed>
            }
          />

          {/* Захищені сторінки */}
          <Route
            path="/profile"
            element={
              <RequireAuth user={user}>
                <Profile />
              </RequireAuth>
            }
          />

          <Route
            path="/map"
            element={
              <RequireAuth user={user}>
                <MapView />
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
            path="/manifest"
            element={
              <RequireAuth user={user}>
                <Manifest />
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

          {/* Фолбек на дім */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
