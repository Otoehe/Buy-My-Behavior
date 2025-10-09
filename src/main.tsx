// src/main.tsx
import "./lib/metamaskGuard";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

import { registerServiceWorker, applyServiceWorkerUpdate } from "./lib/sw-guard";
import UpdateToast from "./components/UpdateToast";

// підхоплення сесії з MetaMask-браузера ДО рендера
import { bootstrapSessionHandoff } from "./lib/sessionHandoffBoot";

// DEV: чистимо старі SW/кеші
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
}

window.addEventListener("error", (e) =>
  console.error("[GlobalError]", (e as any).error ?? (e as any).message)
);
window.addEventListener("unhandledrejection", (e) =>
  console.error("[UnhandledRejection]", (e as any).reason)
);

console.log(import.meta.env.PROD ? "BMB boot production" : "BMB boot dev");

const rootEl = document.getElementById("root")!;

// важливо: після першого рендера сповіщаємо index.html, щоб сховати бренд-заставку
function markAppReady() {
  try {
    window.dispatchEvent(new Event("bmb:app-ready"));
  } catch {}
}

// чекаємо хенд-офф і лише потім рендеримо App
bootstrapSessionHandoff().finally(() => {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
        <UpdateToast />
      </BrowserRouter>
    </React.StrictMode>
  );
  markAppReady();
});

// PROD: реєструємо SW тільки на дозволених хостах і прибираємо «чужі»
const HOST_OK =
  location.hostname.endsWith(".vercel.app") ||
  location.hostname === "buymybehavior.com" ||
  location.hostname === "www.buymybehavior.com";

if (import.meta.env.PROD && HOST_OK) {
  const ver = (import.meta.env as any).VITE_APP_VERSION ?? Date.now();
  registerServiceWorker(`/sw.js?v=${ver}`);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((rs) => {
      rs.forEach((r) => {
        if (!r.active?.scriptURL.includes("sw.js")) r.unregister();
      });
    });
  }
} else {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  }
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

// Прив’язка кнопки «Оновити»
window.addEventListener("bmb:sw-update", () => {
  const btn = document.querySelector("[data-bmb-update]") as HTMLButtonElement | null;
  if (btn) btn.onclick = () => applyServiceWorkerUpdate();
});
