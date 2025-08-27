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

const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));
const ScenarioLocation  = lazy(() => import('./components/ScenarioLocation'));

function Loader() {
  return <div style={{ padding: 16, fontWeight: 600 }}>Завантаження…</div>;
}

class ErrorBoundary extends React.Component<any, { error: any | null }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: any) { return { error }; }
  componentDidCatch(error: any, info: any) { console.error('[Render Error]', error, info); }
  render() {
    if (this.state.error) {
      const msg = String((this.state.error as any)?.message ?? this.state.error);
      return (
        <div style={{ padding: 16, color: '#b91c1c', fontWeight: 600 }}>
          Помилка рендеру: {msg}
        </div>
      );
    }
    return this.props.children;
  }
}

/** Якщо користувач уже залогінений — не показуємо /register, а відразу ведемо в /profile */
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [ready, setReady]   = useState(false);
  const [isAuthed, setAuthed] = useState(false);

  useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAuthed(!!data.session);
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        setAuthed(!!session);
      });
      unsub = () => sub.subscription.unsubscribe();
      setReady(true);
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  if (!ready) return <Loader />;
  if (isAuthed) return <Navigate to="/profile" replace state={{ from: location }} />;
  return <>{children}</>;
}

/** Терплячий guard: чекає подію SIGNED_IN або невеликий таймаут, щоб не кидало на /register під час обміну коду на сесію */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [isAuthed, setAuthed]   = useState(false);

  useEffect(() => {
    let unsub: undefined | (() => void);
    let timeoutId: any;

    (async () => {
      // 1) Миттєва перевірка
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setAuthed(true);
        setChecking(false);
        return;
      }

      // 2) Чекаємо подію логіну
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setAuthed(!!session);
          setChecking(false);
        } else if (event === 'SIGNED_OUT') {
          setAuthed(false);
        }
      });
      unsub = () => sub.subscription.unsubscribe();

      // 3) Fallback — даємо до 2.5с на появу сесії
      timeoutId = setTimeout(() => setChecking(false), 2500);
    })();

    return () => {
      if (unsub) unsub();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  if (checking) return <Loader />;
  if (!isAuthed) return <Navigate to="/register" replace state={{ from: location }} />;
  return <>{children}</>;
}

export default function App() {
  useViewportVH();
  useGlobalImageHints();

  return (
    <>
      <NavigationBar />
      {/* ловить ?code=... навіть якщо відкрили не /auth/callback */}
      <AuthAutoCapture />

      <ErrorBoundary>
        <Suspense fallback={<Loader />}>
          <Routes>
            {/* Рут → карта */}
            <Route path="/" element={<Navigate to="/map" replace />} />

            {/* Публічні */}
            <Route
              path="/register"
              element={
                <RedirectIfAuthed>
                  <Register />
                </RedirectIfAuthed>
              }
            />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Захищені */}
            <Route path="/profile"      element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/behaviors"    element={<RequireAuth><BehaviorsFeed /></RequireAuth>} />
            <Route path="/map"          element={<RequireAuth><MapView /></RequireAuth>} />
            <Route path="/my-orders"    element={<RequireAuth><MyOrders /></RequireAuth>} />
            <Route path="/received"     element={<RequireAuth><ReceivedScenarios /></RequireAuth>} />
            <Route path="/manifest"     element={<RequireAuth><Manifest /></RequireAuth>} />

            {/* Форми сценаріїв */}
            <Route path="/scenario/new"       element={<RequireAuth><ScenarioForm /></RequireAuth>} />
            <Route path="/scenario/location"  element={<RequireAuth><ScenarioLocation /></RequireAuth>} />
            <Route path="/select-location"    element={<RequireAuth><ScenarioLocation /></RequireAuth>} />

            {/* 404 */}
            <Route path="*" element={<div style={{ padding: 16 }}>Сторінку не знайдено</div>} />
          </Routes>
        </Suspense>
      </ErrorBoundary>

      <NetworkToast />
      <SWUpdateToast />
      <A2HS />
    </>
  );
}
