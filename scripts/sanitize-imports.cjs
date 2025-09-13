// scripts/sanitize-imports.cjs
// Масова нормалізація коду перед білдом:
//  - "імпортувати/імпорт … з …" -> "import … from …"
//  - "імпортувати/імпорт 'x'"    -> "import 'x'"
//  - "експортувати/експорт …"    -> "export …"
//  - прибирає NBSP/zero-width, замінює смарт-лапки на звичайні
//  - проходить по ВСЬОМУ репозиторію (крім node_modules, dist, build, .git, .vercel, public)

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.git', '.vercel', 'public']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const ZW_RE = /[\u200B-\u200D\uFEFF\u2060]/g;      // zero-width
const NBSP_RE = /\u00A0/g;                          // NBSP
const SMART_SINGLE = /[\u2018\u2019]/g;             // ‘ ’
const SMART_DOUBLE = /[\u201C\u201D]/g;             // “ ”

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(p, out);
    } else if (EXTS.has(path.extname(name))) {
      out.push(p);
    }
  }
  return out;
}

function normalize(code) {
  let txt = code;
  let changed = false;

  // глобально чистимо невидимі/нестандартні символи
  if (ZW_RE.test(txt)) { txt = txt.replace(ZW_RE, ''); changed = true; }
  if (NBSP_RE.test(txt)) { txt = txt.replace(NBSP_RE, ' '); changed = true; }
  if (SMART_SINGLE.test(txt)) { txt = txt.replace(SMART_SINGLE, "'"); changed = true; }
  if (SMART_DOUBLE.test(txt)) { txt = txt.replace(SMART_DOUBLE, '"'); changed = true; }

  // 1) імпорт з модулем: "імпортувати/імпорт X з 'mod'"
  txt = txt.replace(
    /(^|\n)\s*(?:імпортувати|імпорт)\s+([^;\n]+?)\s+з\s+(['"][^'"]+['"])\s*;?/gmi,
    (_, br, what, from) => { changed = true; return `${br}import ${what} from ${from};`; }
  );

  // 2) сайд-ефект імпорт: "імпортувати/імпорт 'mod'"
  txt = txt.replace(
    /(^|\n)\s*(?:імпортувати|імпорт)\s+(['"][^'"]+['"])\s*;?/gmi,
    (_, br, mod) => { changed = true; return `${br}import ${mod};`; }
  );

  // 3) експорт default
  txt = txt.replace(
    /(^|\n)\s*(?:експортувати|експорт)\s+default\s+/gmi,
    (_, br) => { changed = true; return `${br}export default `; }
  );

  // 4) іменований експорт
  txt = txt.replace(
    /(^|\n)\s*(?:експортувати|експорт)\s+(\{[^;\n]+?\})\s*;?/gmi,
    (_, br, body) => { changed = true; return `${br}export ${body};`; }
  );

  // 5) експорт декларацій
  txt = txt.replace(
    /(^|\n)\s*(?:експортувати|експорт)\s+(const|let|var|function|class)\s/gmi,
    (_, br, kind) => { changed = true; return `${br}export ${kind} `; }
  );

  return { txt, changed };
}

const files = walk(ROOT);
let changes = 0;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const { txt, changed } = normalize(src);
  if (changed) {
    fs.writeFileSync(f, txt);
    console.log('fixed:', path.relative(ROOT, f));
    changes++;
  }
}

console.log(`\n✅ sanitize-imports: updated files = ${changes}`);
