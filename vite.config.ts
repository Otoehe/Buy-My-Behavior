// vite.config.ts
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

// Спільні регекспи
const reZW   = /[\u200B-\u200D\uFEFF\u2060]/g;                 // zero-width, у т.ч. BOM
const reNBSP = /\u00A0/g;                                     // NBSP
const reQ1   = /[\u2018\u2019\u201A\u201B\u2032\u00B4]/g;     // “криві” одинарні → '
const reQ2   = /[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g;// “криві” подвійні → "

// 1) Автосанація коду перед білдом (прибирає смітні символи)
function stripWeirdChars(): PluginOption {
  return {
    name: 'strip-weird-chars',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.(?:[cm]?[tj]sx?)$/.test(id)) return null;
      const cleaned = code
        .replace(reZW, '')
        .replace(reNBSP, ' ')
        .replace(reQ1, "'")
        .replace(reQ2, '"');
      return cleaned === code ? null : { code: cleaned, map: null };
    },
  };
}

// 2) Страж: якщо щось залишилось у секції import/export — зупиняємо білд з чітким меседжем
function guardWeirdImports(): PluginOption {
  return {
    name: 'guard-weird-imports',
    enforce: 'pre',
    transform(code, id) {
      const head = code.split(/\r?\n/).slice(0, 80).join('\n'); // аналізуємо верх файлу
      if (/^\s*імпортувати\s/m.test(head)) this.error(`Україномовний import у файлі: ${id}`);
      if (/^\s*експортувати\s/m.test(head)) this.error(`Україномовний export у файлі: ${id}`);
      if (/\u00A0/.test(head))              this.error(`NBSP (\\u00A0) у рядку import/export у файлі: ${id}`);
      if (/[\u200B-\u200D\uFEFF\u2060]/.test(head)) this.error(`Zero-width символ у файлі: ${id}`);
      if (/[\u2018\u2019\u201C\u201D]/.test(head) && /^\s*(?:import|export)/m.test(head)) {
        this.error(`Смарт-лапки в import/export у файлі: ${id}`);
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), stripWeirdChars(), guardWeirdImports()],
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
      },
    },
  },
});
