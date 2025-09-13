import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function guardWeirdImports() {
  return {
    name: 'guard-weird-imports',
    transform(code: string, id: string) {
      const head = code.split(/\r?\n/).slice(0, 80).join('\n');
      if (/^\s*імпортувати\s/m.test(head)) throw new Error(`Україномовний import у файлі: ${id}`);
      if (/^\s*експортувати\s/m.test(head)) throw new Error(`Україномовний export у файлі: ${id}`);
      if (/\u00A0/.test(head)) throw new Error(`NBSP (\\u00A0) у рядку import/export у файлі: ${id}`);
      if (/[\u200B-\u200D\uFEFF\u2060]/.test(head)) throw new Error(`Zero-width символ у файлі: ${id}`);
      if (/[\u2018\u2019\u201C\u201D]/.test(head) && /^\s*(?:import|export)/m.test(head)) {
        throw new Error(`Смарт-лапки в import/export у файлі: ${id}`);
      }
      return null;
    }
  };
}

export default defineConfig({
  plugins: [react(), guardWeirdImports()],
  server: { port: 5173, strictPort: false },
  define: { 'process.env': {}, global: 'globalThis' },
  esbuild: { target: 'es2020' },
  optimizeDeps: { esbuildOptions: { target: 'es2020' } },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        warn(warning);
      }
    }
  }
});
