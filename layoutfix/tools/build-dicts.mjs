/**
 * Сборщик словарей: строит trie из wordlists (tools/wordlists/<lang>.txt,
 * одно слово на строку) и упаковывает в JSON для chrome.storage.local.
 * Без аргументов — печатает инструкцию; с флагом --seed — строит trie из
 * сид-словарей dict-data.js.
 *
 * Запуск: node tools/build-dicts.mjs [--seed]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'build');
mkdirSync(outDir, { recursive: true });

// Загружаем ядро в песочнице (модули рассчитаны на браузер, но работоспособны в vm)
const sandbox = { self: {} };
vm.createContext(sandbox);

function loadIntoSandbox(relPath) {
  const code = readFileSync(join(root, relPath), 'utf8');
  vm.runInContext(code, sandbox, { filename: relPath });
}

loadIntoSandbox('src/core/namespace.js');
loadIntoSandbox('src/core/trie.js');
loadIntoSandbox('src/dictionaries/dict-data.js');

const LF = sandbox.self.LayoutFix;
if (!LF || !LF.Trie || !LF.DICT_DATA) {
  console.error('Не удалось загрузить ядро для сборки словарей');
  process.exit(1);
}

const languages = Object.keys(LF.DICT_DATA);
const output = {};

for (const lang of languages) {
  const customPath = join(root, 'wordlists', `${lang}.txt`);
  let words;
  if (existsSync(customPath)) {
    words = readFileSync(customPath, 'utf8')
      .split(/\r?\n/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0);
  } else {
    words = LF.DICT_DATA[lang].split(/\s+/).filter(Boolean);
  }
  const trie = LF.Trie.build(words);
  output[lang] = {
    words: words.length,
    nodes: trie.size,
    data: LF.Trie.serialize(trie)
  };
  console.log(`${lang}: ${words.length} words, ${trie.size} nodes`);
}

const outFile = join(outDir, 'dicts.json');
writeFileSync(outFile, JSON.stringify(output));
console.log(`\nЗаписан ${outFile}`);
console.log('Импортируйте его через страницу настроек (импорт словарей) или cargo в chrome.storage.local вручную.');
