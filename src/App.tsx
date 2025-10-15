import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';

import NavigationBar from './components/NavigationBar';
import Register from './components/Register';
import AuthCallback from './components/AuthCallback';

// Ліниві підвантаження наявних компонентів
const MapView            = lazy(() => import('./components/MapView'));
const MyOrders           = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios  = lazy(() => import('./components/ReceivedScenarios'));
const Manifest           = lazy(() => import('./components/Manifest'));
const Profile            = lazy(() => import('./components/Profile'));
const BehaviorsFeed      = lazy(() => import('./components/BehaviorsFeed'));
const ScenarioForm       = lazy(() => import('./components/ScenarioForm')); // ⬅️ ДОДАНО

// Escrow екрани (теж під Lazy)
const EscrowApprove      = lazy(() => import('./components/EscrowApprove'));
const EscrowConfirm      = lazy(() => import('./components/EscrowConfirm'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
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

  if (checking) return null;

  if (!isAuthed) {
    const next = `${location.pathname}${location.search || ''}`;
    return <Navigate to={`/register?next=${encodeURIComponent(next)}`} replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <NavigationBar />
      <Suspense fallback={null}>
        <Routes>
          {/* Публічні */}
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* УСІ приватні шляхи — тільки через RequireAuth */}
          <Route path="/profile"         element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/behaviors"       element={<RequireAuth><BehaviorsFeed /></RequireAuth>} />
          <Route path="/map"             element={<RequireAuth><MapView /></RequireAuth>} />
          <Route path="/map/select"      element={<RequireAuth><MapView /></RequireAuth>} />
          <Route path="/my-orders"       element={<RequireAuth><MyOrders /></RequireAuth>} />
          <Route path="/received"        element={<RequireAuth><ReceivedScenarios /></RequireAuth>} />
          <Route path="/manifest"        element={<RequireAuth><Manifest /></RequireAuth>} />

          {/* Створення сценарію */}
          <Route path="/scenario/new"    element={<RequireAuth><ScenarioForm /></RequireAuth>} /> {/* ⬅️ ДОДАНО */}

          {/* Escrow приватні */}
          <Route path="/escrow/approve"  element={<RequireAuth><EscrowApprove /></RequireAuth>} />
          <Route path="/escrow/confirm"  element={<RequireAuth><EscrowConfirm /></RequireAuth>} />

          {/* Дефолт */}
          <Route path="/" element={<Navigate to="/register" replace />} />
          <Route path="*" element={<Navigate to="/register" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
