// src/App.tsx
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';

import BehaviorsFeed from './components/BehaviorsFeed';
import NavigationBar from './components/NavigationBar';
import Register from './components/Register';
import Profile from './components/Profile';
import AuthCallback from './components/AuthCallback';
import A2HS from './components/A2HS';
import useViewportVH from './lib/useViewportVH';
import useGlobalImageHints from './lib/useGlobalImageHints';
import NetworkToast from './components/NetworkToast';
import SWUpdateToast from './components/SWUpdateToast';

const MapView = lazy(() => import('./components/MapView'));
const MyOrders = lazy(() => import('./components/MyOrders'));
const ReceivedScenarios = lazy(() => import('./components/ReceivedScenarios'));
const Manifest = lazy(() => import('./components/Manifest'));
const ScenarioForm = lazy(() => import('./components/ScenarioForm'));

/** Примусово використовуємо www-хост (щоб localStorage/сесія не “губилися” між хостами) */
function useEnforceWWW() {
  useEffect(() => {
    const h = window.location.hostname;
    if (h === 'buymybehavior.com') {
      const to = `https://www.buymybehavior.com${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(to);
    }
  }, []);
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const [state, setState] = useState<'checking' | 'authed' | 'guest'>('checking');
  const tRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function hardCheck(label: string) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (session) setState('authed');
      else setState('guest');
    }

    (async () => {
      // перша синхронна перевірка
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      setState(session ? 'authed' : 'checking'); // важливо: не одразу guest — даємо шанс події SIGNED_IN

      // підписки
      const { data: sub } = supabase.auth.onAuthStateChange((ev, session) => {
        // для дебагу можна відкрити консоль:
        // console.log('[auth event]', ev, !!session);

        if (!alive) return;

        if (session) {
          setState('authed');
          if (tRef.current) { window.clearTimeout(tRef.current); tRef.current = null; }
          return;
        }

        // Якщо подія без сесії — не поспішаємо. Даємо 5–15 сек і перевіряємо ще раз.
        if (tRef.current) window.clearTimeout(tRef.current);
        const delay = ev === 'INITIAL_SESSION' ? 5000 : 15000;
        tRef.current = window.setTimeout(() => {
          hardCheck('delayed');
        }, delay);
      });

      return () => {
        alive = false;
        sub.subscription.unsubscribe();
        if (tRef.current) window.clearTimeout(tRef.current);
      };
    })();
  }, []);

  if (state === 'checking') return <div style={{ padding: '1rem' }}>Завантаження…</div>;
  if (state === 'guest') return <Navigate to="/register" replace />;
  return children;
}

export default function App() {
  useViewportVH();
  useGlobalImageHints();
  useEnforceWWW();

  return (
    <>
      <NavigationBar />
      <A2HS />
      <NetworkToast />
      <SWUpdateToast />

      <Suspense fallback={<div style={{ padding: '1rem' }}>Завантаження…</div>}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback next="/map" />} />

          {/* публічні */}
          <Route path="/register" element={<Register />} />
          <Route path="/behaviors" element={<BehaviorsFeed />} />

          {/* захищені */}
          <Route path="/map"          element={<RequireAuth><MapView /></RequireAuth>} />
          <Route path="/profile"      element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/my-orders"    element={<RequireAuth><MyOrders /></RequireAuth>} />
          <Route path="/received"     element={<RequireAuth><ReceivedScenarios /></RequireAuth>} />
          <Route path="/scenario/new" element={<RequireAuth><ScenarioForm /></RequireAuth>} />
          <Route path="/manifest"     element={<RequireAuth><Manifest /></RequireAuth>} />

          {/* дефолт */}
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
