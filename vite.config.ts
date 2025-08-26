// vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const allowed = [];

  try {
    if (env.VITE_PUBLIC_APP_URL) {
      allowed.push(new URL(env.VITE_PUBLIC_APP_URL).host);
    }
  } catch {}

  return {
    plugins: [react()],
    base: '/',
    server: {
      host: true,
      port: 5173,
      allowedHosts: allowed, // буде [], якщо VITE_PUBLIC_APP_URL не заданий
    },
  };
});
