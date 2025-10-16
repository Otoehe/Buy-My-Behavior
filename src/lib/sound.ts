// src/lib/sound.ts
let audioEl: HTMLAudioElement | null = null;

export function playNotify() {
  try {
    if (!audioEl) {
      // Один фірмовий звук на весь сайт (ти показував точний файл)
      audioEl = new Audio('/dist/notification.wav');
      audioEl.preload = 'auto';
    }
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {/* тихо ігноруємо, якщо браузер блокує авто-play */});
  } catch {}
}
