// src/App.tsx — ПОВНА версія
import React, { Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

// ===== Основні екрани BMB =====
import MapView from "./components/MapView";                // TODO: перевір шлях
// (Ці екрани можуть мати інші шляхи у твоєму репо — відкоригуй за потреби)
import Login from "./components/Login";                    // новий файл
import Register from "./components/Register";              // новий файл-редіректор
import EscrowApprove from "./components/EscrowApprove";    // новий файл
import EscrowConfirm from "./components/EscrowConfirm";    // новий файл

// ===== (Необов’язково) Якщо в тебе є верхнє меню/хедер =====
// Якщо NavigationBar у тебе в іншому місці або рендериться в index.tsx — просто видали цей імпорт і <Header/> нижче.
import NavigationBar from "./components/NavigationBar";    // TODO: перевір шлях

// ===== (Необов’язково) Інші сторінки, якщо вони існують у твоєму проєкті =====
// Можеш закоментувати, якщо такі файли відсутні або інші шляхи імпорту
// import Manifest from "./pages/Manifest";
// import ChooseExecutor from "./pages/ChooseExecutor";
// import MyOrders from "./pages/MyOrders";
// import ReceivedScenarios from "./pages/ReceivedScenarios";
// import Profile from "./pages/Profile";
// import ScenarioNew from "./pages/ScenarioNew";

// Невелика утиліта для автоскролу вгору між маршрутами
function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    // даємо SPA завершити рендер і скролимо вгору
    const t = setTimeout(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }), 0);
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
}

// Мінімальний контейнер застосунку
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Верхнє меню (збережи, якщо воно в тебе є; інакше — видали цей рядок) */}
      <NavigationBar />
      {/* Контент сторінок */}
      <main style={{ flex: 1, minHeight: 0 }}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <AppLayout>
        {/* Suspense на випадок, якщо частина екранів підвантажується динамічно */}
        <Suspense fallback={null}>
          <Routes>
            {/* ГОЛОВНИЙ ПОТІК */}
            <Route path="/" element={<Navigate to="/map" replace />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/map/select" element={<MapView />} />

            {/* AUTH / WEB3 */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* ESCROW FALLBACK-СТОРІНКИ (щоб не було “білих” екранів) */}
            <Route path="/escrow/approve" element={<EscrowApprove />} />
            <Route path="/escrow/confirm" element={<EscrowConfirm />} />

            {/* (НЕОБОВ’ЯЗКОВО) Якщо маєш ці сторінки — розкоментуй імпорти вище і рядки нижче */}
            {/*
            <Route path="/manifest" element={<Manifest />} />
            <Route path="/executors" element={<ChooseExecutor />} />
            <Route path="/my-orders" element={<MyOrders />} />
            <Route path="/received" element={<ReceivedScenarios />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/scenario/new" element={<ScenarioNew />} />
            */}

            {/* 404 → на мапу */}
            <Route path="*" element={<Navigate to="/map" replace />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </>
  );
}
