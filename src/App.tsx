import React, { useEffect, useState, Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";            // ← ВАЖЛИВО: саме ./lib/supabase

import BehaviorsFeed   from "./components/BehaviorsFeed";
import NavigationBar   from "./components/NavigationBar";
import Profile         from "./components/Profile";
import AuthCallback    from "./components/AuthCallback";
import A2HS            from "./components/A2HS";
import Register        from "./components/Register";

import useViewportVH        from "./lib/useViewportVH";
import useGlobalImageHints  from "./lib/useGlobalImageHints";
import NetworkToast         from "./components/NetworkToast";
import SWUpdateToast        from "./components/SWUpdateToast";
import BmbModalHost         from "./components/BmbModalHost";
import { isMetaMaskInApp }  from "./lib/isMetaMaskBrowser";

const MapView           = lazy(() => import("./components/MapView"));
const MyOrders          = lazy(() => import("./components/MyOrders"));
const ReceivedScenarios = lazy(() => import("./components/ReceivedScenarios"));
const Manifest          = lazy(() => import("./components/Manifest"));
const ScenarioForm      = lazy(() => import("./components/ScenarioForm"));
const ScenarioLocation  = lazy(() => import("./components/ScenarioLocation"));
const BmbModalsDemo     = lazy(() => import("./components/BmbModalsDemo"));
const EscrowHandoff     = lazy(() => import("./components/EscrowHandoff"));

function RequireAuth({
  user,
  children,
}: {
  user: User | null | undefined;
  children: React.ReactElement;
}) {
  const location = useLocation();
  if (user === undefined) return null;
  if (user === null) {
    return (
      <Navigate
        to="/escrow/approve?next=/my-orders"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return children;
}

function HomeGate() {
  return isMetaMaskInApp()
    ? <Navigate to="/escrow/approve?next=/my-orders" replace />
    : <Navigate to="/register" replace />;
}

export default function App() {
  useViewportVH();
  useGlobalImageHints();

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const location = useLocation();
  const navigate = useNavigate();

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

  // якщо MetaMask in-app — / та /register ведуть у escrow
  useEffect(() => {
    if (!isMetaMaskInApp()) return;
    const p = location.pathname;
    if (p === "/" || p === "/register") {
      navigate("/escrow/approve?next=/my-orders", { replace: true });
    }
  }, [location.pathname, navigate]);

  if (user === undefined) return null;

  const HIDE_UI_ROUTES = new Set<string>(["/map/select", "/escrow/approve"]);
  const pathname = location.pathname;
  const hideNavAndA2HS = HIDE_UI_ROUTES.has(pathname);
  const showGlobalA2HS = !hideNavAndA2HS && pathname !== "/profile";

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
          <Route path="/auth/callback"  element={<AuthCallback />} />
          <Route path="/escrow/approve" element={<EscrowHandoff />} />
          <Route
            path="/register"
            element={
              isMetaMaskInApp()
                ? <Navigate to="/escrow/approve?next=/my-orders" replace />
                : <Register />
            }
          />

          <Route path="/map"        element={<MapView />} />
          <Route path="/map/select" element={<ScenarioLocation />} />
          <Route path="/behaviors"  element={<BehaviorsFeed />} />
          <Route path="/manifest"   element={<Manifest />} />
          <Route path="/modals"     element={<BmbModalsDemo />} />

          {/* Приватні */}
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
