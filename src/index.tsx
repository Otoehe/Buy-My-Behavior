// src/main.tsx (або index.tsx)
import { registerServiceWorker, applyServiceWorkerUpdate } from './lib/sw-guard';

// 1) Реєстрація SW
registerServiceWorker('/sw.js');

// 2) Якщо вже є власна плашка "Доступна нова версія",
//   просто прив’яжи її кнопку "Оновити" до applyServiceWorkerUpdate().
window.addEventListener('bmb:sw-update', () => {
  // Приклад: якщо кнопка має атрибут data-bmb-update
  const btn = document.querySelector('[data-bmb-update]');
  if (btn) (btn as HTMLButtonElement).onclick = () => applyServiceWorkerUpdate();
});
