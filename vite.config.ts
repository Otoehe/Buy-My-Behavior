import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  define: {
    // запобігає падінням, якщо якийсь пакет очікує Node-глобалі
    'process.env': {},
    global: 'globalThis'
  },
  esbuild: {
    target: 'es2020'
  },
  optimizeDeps: {
    esbuildOptions: { target: 'es2020' }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      onwarn(warning, warn) {
        // прибираємо шум, але не ховаємо реальні помилки
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        warn(warning);
      }
    }
  }
});
