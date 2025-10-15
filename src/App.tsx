import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import MapView from "./components/MapView";
import Login from "./components/Login";
import Register from "./components/Register";
import EscrowApprove from "./components/EscrowApprove";
import EscrowConfirm from "./components/EscrowConfirm";

function NotFound() {
  return (
    <div style={{ minHeight: "calc(100dvh - 56px)", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center", color: "#111827" }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>404</h1>
        <div style={{ color: "#6b7280", marginBottom: 16 }}>Сторінку не знайдено</div>
        <a href="/map" style={{ display: "inline-block", padding: "10px 16px", borderRadius: 999, background: "#000", color: "#fff", fontWeight: 800, textDecoration: "none" }}>
          На карту
        </a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>Завантаження…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />

          {/* Карта */}
          <Route path="/map" element={<MapView />} />
          <Route path="/map/select" element={<MapView />} />

          {/* Актуальний вхід */}
          <Route path="/login" element={<Login />} />

          {/* Старі шляхи реєстрації → редірект у /login */}
          <Route path="/register" element={<Register />} />
          <Route path="/signup" element={<Register />} />
          <Route path="/reg" element={<Register />} />

          {/* Ескроу */}
          <Route path="/escrow/approve" element={<EscrowApprove />} />
          <Route path="/escrow/confirm" element={<EscrowConfirm />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
