// src/main.tsx
import './lib/metamaskGuard';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

import { registerServiceWorker } from './lib/sw-guard';
import UpdateToast from './components/UpdateToast';

// DEV: чистимо старі SW/кеші, щоб не ловити «білий екран»
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  if ('caches' in window) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

window.addEventListener('error', e => console.error('[GlobalError]', (e as any).error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[UnhandledRejection]', (e as any).reason));

console.log(import.meta.env.PROD ? 'BMB boot production' : 'BMB boot dev');

const rootEl = document.getElementById('root')!;
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      {/* плашка «Доступна нова версія» */}
      <UpdateToast />
    </BrowserRouter>
  </React.StrictMode>
);

// PROD: реєструємо SW без автоперезавантажень
if (import.meta.env.PROD) {
  const ver = (import.meta.env as any).VITE_APP_VERSION ?? Date.now();
  registerServiceWorker(`/sw.js?v=${ver}`);
}
