/**
 * Проверка синтаксиса всех JS-файлов расширения через node --check.
 * Запуск: node tools/check-syntax.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walk(p, out);
    } else if (name.endsWith('.js') || name.endsWith('.mjs')) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(root);
let failed = 0;
for (const f of files) {
  const isModule = f.endsWith('.mjs');
  try {
    execFileSync(process.execPath, isModule ? ['--check', f] : ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`✗ ${relative(root, f)}`);
    console.error(String(e.stderr || e.message));
  }
}
if (failed) {
  console.error(`\n${failed} file(s) failed syntax check`);
  process.exit(1);
}
console.log(`✓ ${files.length} files: syntax OK`);
