import React, { useEffect, useState, Suspense, lazy, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';

import BehaviorsFeed   from './components/BehaviorsFeed';
import NavigationBar   from './components/NavigationBar';
import Register        from './components/Register';
import Profile         from './components/Profile';
import AuthCallback    from './components/AuthCallback';
import A2HS            from './components/A2HS';
// import AuthAutoCapture from './components/AuthAutoCapture'; // важливо: ВИМКНЕНО, щоб уникнути гонок

import useViewportVH        from './lib/useViewportVH';
import useGlobalImageHints  from './lib/useGlobalImageHints';
import NetworkToast         from './components/NetworkToast';
import SWUpdateToast        from './components/SWUpdateToast';

// Якщо цих компонентів нема у проєкті — просто закоментуй:
import PwaLaunchGuard from './components/PwaLaunchGuard';
import InAppOpenInBrowserBanner from './components/InAppOpenInBrowserBanner';

const MapView           = lazy(() => import('./components/MapView'));
const MyOrders          = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest          = lazy(() => import('./components/Manifest'));
const ScenarioForm      = lazy(() => import('./components/ScenarioForm'));

// ---------- ЄДИНИЙ auth-контекст У ЦЬОМУ Ж ФАЙЛІ ----------
type AuthStatus = 'loading' | 'authed' | 'guest';
type AuthCtx = { status: AuthStatus; user: any | null };
const AuthContext = createContext<AuthCtx>({ status: 'loading', user: null });
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<any | null>(null);

  // Початкова гідратація
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!mounted) return;
        if (error) {
          setUser(null);
          setStatus('guest');
        } else if (data?.user) {
          setUser(data.user);
          setStatus('authed');
        } else {
          setUser(null);
          setStatus('guest');
        }
      } catch {
        if (mounted) {
          setUser(null);
          setStatus('guest');
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Live-підписка
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.user) {
        setUser(session.user);
        setStatus('authed');
      } else {
        setUser(null);
        setStatus('guest');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ status, user }}>{children}</AuthContext.Provider>;
}

// Не редіректимо, поки auth = loading
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
        <div>Завантаження…</div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/register" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

// Якщо вже залогінений — одразу на /map
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <>{children}</>;
  if (user) return <Navigate to="/map" replace />;
  return <>{children}</>;
}

// ----------------- APP -----------------
export default function App() {
  useViewportVH();
  useGlobalImageHints();

  return (
    <AuthProvider>
      {/* Якщо цих компонентів нема — закоментуй */}
      <PwaLaunchGuard />
      <InAppOpenInBrowserBanner />

      <div className="app-root">
        <NavigationBar />
        <A2HS />
        <NetworkToast />
        <SWUpdateToast />

        <Suspense fallback={<div style={{ padding: 24 }}>Завантаження…</div>}>
          <Routes>
            {/* Публічні */}
            <Route path="/" element={<BehaviorsFeed />} />

            {/* /register: якщо вже залогінений — редірект на /map */}
            <Route
              path="/register"
              element={
                <RedirectIfAuthed>
                  <Register />
                </RedirectIfAuthed>
              }
            />

            {/* Supabase callback (вже оновлений) */}
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Захищені */}
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

            <Route path="/manifest" element={<Manifest />} />
          </Routes>
        </Suspense>
      </div>
    </AuthProvider>
  );
}
