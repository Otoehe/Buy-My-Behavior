// scripts/sanitize-imports.cjs
// Запуск: `node scripts/sanitize-imports.cjs --fix`
// Прибирає zero-width/NBSP/BOM, уніфікує лапки й випадкові "імпортувати/експортувати"

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);

const FLAGS = {
  FIX: process.argv.includes('--fix'),
};

const RE = {
  ZW: /[\u200B-\u200D\uFEFF\u2060]/g,     // zero-width chars incl. BOM
  NBSP: /\u00A0/g,                         // NBSP
  CURLY_QUOTES: /[\u2018\u2019\u201A\u201B\u2032\u00B4]/g,   // → '
  CURLY_DQUOTES: /[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g, // → "
  // випадки автоперекладу
  IMPORT_UA: /\bімпортувати\b/gi,
  EXPORT_UA: /\bекспортувати\b/gi,
};

function sanitize(text) {
  let out = text;
  // прибираємо невидимі
  out = out.replace(RE.ZW, '');
  out = out.replace(RE.NBSP, ' ');
  // уніфікуємо лапки
  out = out.replace(RE.CURLY_QUOTES, '\'');
  out = out.replace(RE.CURLY_DQUOTES, '"');
  // захист від автоперекладу ключових слів
  out = out.replace(RE.IMPORT_UA, 'import');
  out = out.replace(RE.EXPORT_UA, 'export');
  // якщо на початку лишився BOM — знімаємо
  if (out.charCodeAt(0) === 0xFEFF) out = out.slice(1);
  return out;
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.next')) continue;
      walk(p);
    } else if (exts.has(path.extname(name))) {
      const src = fs.readFileSync(p, 'utf8');
      const cleaned = sanitize(src);
      if (src !== cleaned) {
        if (FLAGS.FIX) {
          fs.writeFileSync(p, cleaned, 'utf8');
          console.log('fixed:', p.replace(ROOT + path.sep, ''));
        } else {
          console.log('needs-fix:', p.replace(ROOT + path.sep, ''));
        }
      }
    }
  }
}

walk(path.join(ROOT, 'src'));
