// src/main.tsx
import './lib/metamaskGuard'; // як і було
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

import { registerServiceWorker, applyServiceWorkerUpdate } from './lib/sw-guard';

// DEV: вимикаємо SW повністю
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  if ('caches' in window) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

// Глобальні ловці помилок (залишити)
window.addEventListener('error', e => console.error('[GlobalError]', (e as any).error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[UnhandledRejection]', (e as any).reason));

console.log('BMB boot dev');

const root = document.getElementById('root')!;
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// PROD: реєстрація SW БЕЗ авто-reload
if (import.meta.env.PROD) {
  registerServiceWorker('/sw.js');

  // якщо у вас вже є банер — слухайте подію і навісьте кнопку
  window.addEventListener('bmb:sw-update', () => {
    const btn = document.querySelector('[data-bmb-update]') as HTMLButtonElement | null;
    if (btn) btn.onclick = () => applyServiceWorkerUpdate();
    // якщо кнопки немає — можна тут показати свій тост або викликати applyServiceWorkerUpdate()
    // але краще — кнопкою, щоб не було "стрибань".
  });
}
