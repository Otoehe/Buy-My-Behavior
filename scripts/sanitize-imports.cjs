// scripts/sanitize-imports.cjs
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);
const FIX = process.argv.includes('--fix');

const ZW_RE = /[\u200B-\u200D\uFEFF\u2060]/g;
const NBSP_RE = /\u00A0/g;
const SMARTQ_RE = /[\u2018\u2019\u201C\u201D]/g;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '.next') continue;
      walk(p, out);
    } else if (exts.has(path.extname(name))) {
      out.push(p);
    }
  }
  return out;
}

function fixFile(src) {
  let changed = false;
  let text = src;

  if (ZW_RE.test(text)) { text = text.replace(ZW_RE, ''); changed = true; }
  if (NBSP_RE.test(text)) { text = text.replace(NBSP_RE, ' '); changed = true; }

  text = text.replace(
    /^(\s*)імпортувати\s+([^;\n]+?)\s+з\s+(['"][^'"]+['"]);?/gm,
    (_, i, what, from) => { changed = true; return `${i}import ${what} from ${from};`; }
  );
  text = text.replace(
    /^(\s*)імпортувати\s+(['"][^'"]+['"]);?/gm,
    (_, i, mod) => { changed = true; return `${i}import ${mod};`; }
  );

  text = text.replace(
    /(^|\n)(\s*(?:import|export)[^\n]*)/g,
    (_, br, line) => {
      const fixed = line.replace(SMARTQ_RE, '\'');
      if (fixed !== line) changed = true;
      return br + fixed;
    }
  );

  text = text.replace(/^(\s*)експортувати\s+default\s+/gm, (_, i) => { changed = true; return `${i}export default `; });
  text = text.replace(/^(\s*)експортувати\s+(\{[^;\n]+?\});?/gm, (_, i, body) => { changed = true; return `${i}export ${body};`; });
  text = text.replace(/^(\s*)експортувати\s+(const|let|var|function|class)\s/gm, (_, i, k) => { changed = true; return `${i}export ${k} `; });

  return { text, changed };
}

const files = walk(path.join(ROOT, 'src'));
let touched = 0, found = 0;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const { text, changed } = fixFile(src);
  const weird = /(^|\n)\s*імпортувати\s/.test(text) || /(^|\n)\s*експортувати\s/.test(text);

  if (changed && FIX) { fs.writeFileSync(f, text); console.log('fixed:', f); touched++; }
  else if (changed && !FIX) { console.log('need-fix:', f); found++; }
  else if (weird) { console.log('need-fix:', f); found++; }
}

if (!FIX && (touched || found)) {
  console.error('\n❌ Знайдено файли, які треба виправити. Запусти: node scripts/sanitize-imports.cjs --fix\n');
  process.exit(1);
}

console.log(`✅ Sanitize done. Changed: ${touched}, Remaining issues: ${found}.`);
