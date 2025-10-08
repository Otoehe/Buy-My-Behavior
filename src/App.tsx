import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

import BehaviorsFeed   from './components/BehaviorsFeed';
import NavigationBar   from './components/NavigationBar';
import Profile         from './components/Profile';
import AuthCallback    from './components/AuthCallback';
import A2HS            from './components/A2HS';

import useViewportVH        from './lib/useViewportVH';
import useGlobalImageHints  from './lib/useGlobalImageHints';
import NetworkToast         from './components/NetworkToast';
import SWUpdateToast        from './components/SWUpdateToast';
import BmbModalHost         from './components/BmbModalHost';

// 🔹 Ліниві імпорти
const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));
const ScenarioLocation  = lazy(() => import('./components/ScenarioLocation'));
const BmbModalsDemo     = lazy(() => import('./components/BmbModalsDemo'));

// ✅ новий публічний маршрут для handoff у MetaMask-браузер
const AuthHandoff       = lazy(() => import('./components/AuthHandoff'));

// ✅ замість Register тепер сторінка входу з MetaMask
const Login             = lazy(() => import('./components/Login'));

// ───────────────────────────────────────────────────────────────────────────────
// Допоміжні утиліти авторизації
// ───────────────────────────────────────────────────────────────────────────────
const getWalletAddress = (): string | null =>
  typeof window !== 'undefined' ? localStorage.getItem('wallet_address') : null;

function RequireAuth({
  user,
  children,
}: {
  user: User | null | undefined;
  children: React.ReactElement;
}) {
  const location = useLocation();
  const wallet = getWalletAddress();

  // Поки не знаємо стан auth — нічого не рендеримо
  if (user === undefined) return null;

  // Пропускаємо, якщо є Supabase user АБО MetaMask-гаманець у localStorage
  if (user || wallet) return children;

  // Інакше відправляємо на публічну сторінку входу
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function RedirectIfAuthed({
  user,
  children,
}: {
  user: User | null | undefined;
  children: React.ReactElement;
}) {
  const wallet = getWalletAddress();
  if (user === undefined) return null;
  if (user || wallet) return <Navigate to="/map" replace />;
  return children;
}

function HomeGate() {
  // Якщо вже є гаманець — можна везти одразу в замовлення
  const wallet = getWalletAddress();
  return <Navigate to={wallet ? '/my-orders' : '/map'} replace />;
}

// ───────────────────────────────────────────────────────────────────────────────

export default function App() {
  useViewportVH();
  useGlobalImageHints();

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (user === undefined) return null;

  // Режим “чиста карта”: де не показуємо навбар та A2HS
  const HIDE_UI_ROUTES = new Set<string>(['/map/select']);
  const pathname = location.pathname;
  const hideNavAndA2HS = HIDE_UI_ROUTES.has(pathname);
  const showGlobalA2HS = !hideNavAndA2HS && pathname !== '/profile';

  return (
    <>
      {showGlobalA2HS && <A2HS />}
      <NetworkToast />
      <SWUpdateToast />
      {!hideNavAndA2HS && <NavigationBar />}
      <BmbModalHost />

      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomeGate />} />

          {/* Публічні */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/handoff"  element={<AuthHandoff />} />
          <Route
            path="/login"
            element={
              <RedirectIfAuthed user={user}>
                <Login />
              </RedirectIfAuthed>
            }
          />
          {/* Сумісність: якщо десь залишилось /register — веземо на /login */}
          <Route path="/register" element={<Navigate to="/login" replace />} />

          {/* Загальнодоступні сторінки */}
          <Route path="/map"          element={<MapView />} />
          <Route path="/map/select"   element={<ScenarioLocation />} />
          <Route path="/behaviors"    element={<BehaviorsFeed />} />
          <Route path="/manifest"     element={<Manifest />} />
          <Route path="/modals"       element={<BmbModalsDemo />} />

          {/* Приватні (доступні якщо є Supabase-сесія або wallet у localStorage) */}
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
