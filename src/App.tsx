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
import AuthAutoCapture from './components/AuthAutoCapture'; // лишаємо

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
  render() { return this.state.error
    ? <div style={{ padding: 16, color: '#b91c1c', fontWeight: 600 }}>Помилка рендеру: {String((this.state.error as any)?.message ?? this.state.error)}</div>
    : this.props.children; }
}

// ⬇️ НОВЕ: якщо вже автентифікований — не показувати /register, а одразу на /profile
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      const { data } = await supabase.auth.getSession();
      setIsAuthed(!!data.session);
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        setIsAuthed(!!session);
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      const { data } = await supabase.auth.getSession();
      setIsAuthed(!!data.session);
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        setIsAuthed(!!session);
      });
      unsub = () => sub.subscription.unsubscribe();
      setChecking(false);
    })();
    return () => { if (unsub) unsub(); };
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
      <AuthAutoCapture /> {/* ловить ?code=... навіть якщо лінк відкрив не /auth/callback */}

      <ErrorBoundary>
        <Suspense fallback={<Loader />}>
          <Routes>
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

            {/* Форма сценарію */}
            <Route path="/scenario/new"       element={<RequireAuth><ScenarioForm /></RequireAuth>} />
            <Route path="/scenario/location"  element={<RequireAuth><ScenarioLocation /></RequireAuth>} />
            <Route path="/select-location"    element={<RequireAuth><ScenarioLocation /></RequireAuth>} />

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
