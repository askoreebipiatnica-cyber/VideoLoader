/**
 * Тесты ядра LayoutFix. Запуск: node layoutfix/test/run.mjs
 * Ядро не зависит от DOM, поэтому гоняется прямо в Node через vm.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const sandbox = { self: {}, console, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(relPath) {
  const code = readFileSync(join(root, relPath), 'utf8');
  vm.runInContext(code, sandbox, { filename: relPath });
}

load('src/core/namespace.js');
load('src/core/settings.js');
load('src/core/layouts.js');
load('src/core/converter.js');
load('src/core/trie.js');
load('src/core/heuristics.js');
load('src/core/ringbuffer.js');
load('src/core/guard.js');
load('src/core/engine.js');
load('src/dictionaries/dict-data.js');

const LF = sandbox.self.LayoutFix;

// Тестовые словари из сид-данных
const dicts = {};
for (const lang of Object.keys(LF.DICT_DATA)) {
  dicts[lang] = LF.Trie.build(LF.DICT_DATA[lang].split(/\s+/).filter(Boolean));
}

// ---------- Мини-раннер ----------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`      ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'eq'}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  }
}

// ---------- Converter ----------

console.log('\nConverter');
test('ru -> en базовая перекладка', () => {
  eq(LF.Converter.convertExact('руддщ', 'ru', 'en'), 'hello');
});
test('en -> ru базовая перекладка', () => {
  eq(LF.Converter.convertExact('ghbdtn', 'en', 'ru'), 'привет');
});
test('регистр сохраняется', () => {
  eq(LF.Converter.convertExact('Ghbdtn', 'en', 'ru'), 'Привет');
  eq(LF.Converter.convertExact('ПРИВЕТ', 'ru', 'en'), 'GHBDTN');
});
test('несловарные символы дают null в convertExact', () => {
  eq(LF.Converter.convertExact('привет@', 'ru', 'en'), null);
});
test('convert оставляет чужие символы', () => {
  eq(LF.Converter.convert('ghbdtn!', 'en', 'ru'), 'привет!');
});
test('пунктуация en->ru', () => {
  eq(LF.Converter.convertExact('b', 'en', 'ru'), 'и');
});
test('de QWERTZ: z/y перестановка', () => {
  eq(LF.Converter.convertExact('z', 'de', 'en'), 'y');
  eq(LF.Converter.convertExact('y', 'de', 'en'), 'z');
});
test('detectLayout определяет раскладку', () => {
  eq(LF.Converter.detectLayout('ghbdtn'), 'en');
  eq(LF.Converter.detectLayout('привет'), 'ru');
});

// ---------- Heuristics ----------

console.log('\nHeuristics');
test('score выше для словарного слова', () => {
  const good = LF.Heuristics.score('привет', 'ru', dicts.ru);
  const bad = LF.Heuristics.score('руддщ', 'ru', dicts.ru);
  assert(good > bad, `good=${good}, bad=${bad}`);
});
test('словарное слово набирает порог 90', () => {
  const s = LF.Heuristics.score('привет', 'ru', dicts.ru);
  assert(s >= 90, `score=${s}`);
});
test('невозможные биграммы штрафуются', () => {
  const withBad = LF.Heuristics.score('аьвл', 'ru', dicts.ru);
  const normal = LF.Heuristics.score('мама', 'ru', dicts.ru);
  assert(withBad < normal, `withBad=${withBad}, normal=${normal}`);
});
test('fixCapsCase: пРИВЕТ -> Привет', () => {
  eq(LF.Heuristics.fixCapsCase('пРИВЕТ', true), 'Привет');
});
test('looksLikeCapsLock', () => {
  eq(LF.Heuristics.looksLikeCapsLock('ПРИВЕТ'), true);
  eq(LF.Heuristics.looksLikeCapsLock('Мир'), false);
  eq(LF.Heuristics.looksLikeCapsLock('привет'), false);
});
test('scriptOf', () => {
  eq(LF.Heuristics.scriptOf('привет'), 'cyr');
  eq(LF.Heuristics.scriptOf('hello'), 'lat');
  eq(LF.Heuristics.scriptOf('שלום'), 'heb');
});

// ---------- Trie ----------

console.log('\nTrie');
test('has/hasPrefix', () => {
  const t = LF.Trie.build(['привет', 'мир', 'прививка']);
  eq(LF.Trie.has(t, 'привет'), true);
  eq(LF.Trie.has(t, 'прив'), false);
  eq(LF.Trie.hasPrefix(t, 'прив'), true);
  eq(LF.Trie.has(t, 'мир'), true);
  eq(LF.Trie.has(t, 'дом'), false);
});
test('регистронезависимость', () => {
  const t = LF.Trie.build(['Hello']);
  eq(LF.Trie.has(t, 'hello'), true);
  eq(LF.Trie.has(t, 'HELLO'), true);
});
test('serialize/load roundtrip', () => {
  const t = LF.Trie.build(['abc', 'abd', 'b']);
  const t2 = LF.Trie.load(LF.Trie.serialize(t));
  eq(LF.Trie.has(t2, 'abc'), true);
  eq(LF.Trie.has(t2, 'abd'), true);
  eq(LF.Trie.has(t2, 'b'), true);
  eq(LF.Trie.has(t2, 'abx'), false);
});
test('пустые слова игнорируются', () => {
  const t = LF.Trie.build(['', 'ok', '']);
  eq(LF.Trie.wordCount(t), 1);
});

// ---------- Engine ----------

console.log('\nEngine');
test('lastWordOf', () => {
  const r = LF.Engine.lastWordOf('привет как дел  ');
  eq(r.word, 'дел');
  eq(r.offset, 11);
});
test('lastWordOf пустой/null', () => {
  eq(LF.Engine.lastWordOf(''), null);
  eq(LF.Engine.lastWordOf('   '), null);
  eq(LF.Engine.lastWordOf(null), null);
});
test('analyze распознаёт ghbdtn -> привет', () => {
  const v = LF.Engine.analyze('ghbdtn', {
    pairs: ['en|ru', 'ru|en'],
    dicts,
    threshold: 90
  });
  eq(v.fix, 'привет');
  assert(v.confidence >= 90, `confidence=${v.confidence}`);
});
test('analyze не чинит нормальное слово', () => {
  const v = LF.Engine.analyze('привет', {
    pairs: ['en|ru', 'ru|en'],
    dicts,
    threshold: 90
  });
  eq(v.fix, null);
});
test('analyze отбрасывает бессмыслицу без уверенности', () => {
  const v = LF.Engine.analyze('rrr', {
    pairs: ['en|ru', 'ru|en'],
    dicts,
    threshold: 90
  });
  eq(v.fix, null);
});
test('capsFix для словарного слова', () => {
  const fixed = LF.Engine.capsFix('ПРИВЕТ', { fixCaps: true, dicts });
  eq(fixed, 'Привет');
});
test('capsFix не трогает короткие слова', () => {
  const fixed = LF.Engine.capsFix('МИР', { fixCaps: true, dicts });
  eq(fixed, null);
});

// ---------- Guard ----------

console.log('\nGuard');
const fakeEl = (attrs, tag = 'input') => {
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    _attrs: {},
    parentElement: null
  };
  for (const [k, v] of Object.entries(attrs)) el._attrs[k] = v;
  el.hasAttribute = (k) => k in el._attrs;
  el.getAttribute = (k) => (k in el._attrs ? el._attrs[k] : null);
  return el;
};

test('input[type=password] приватный', () => {
  eq(LF.Guard.isPrivateField(fakeEl({ type: 'password' })), true);
});
test('input[type=hidden] приватный', () => {
  eq(LF.Guard.isPrivateField(fakeEl({ type: 'hidden' })), true);
});
test('autocomplete=cc-number приватный', () => {
  eq(LF.Guard.isPrivateField(fakeEl({ autocomplete: 'cc-number' })), true);
});
test('autocomplete=one-time-code приватный', () => {
  eq(LF.Guard.isPrivateField(fakeEl({ autocomplete: 'one-time-code' })), true);
});
test('data-private приватный', () => {
  eq(LF.Guard.isPrivateField(fakeEl({ 'data-private': 'true' }, 'div')), true);
});
test('aria-hidden=true приватный', () => {
  eq(LF.Guard.isPrivateField(fakeEl({ 'aria-hidden': 'true' }, 'div')), true);
});
test('обычное текстовое поле разрешено', () => {
  eq(LF.Guard.isPrivateField(fakeEl({ type: 'text' })), false);
});
test('предки с data-private блокируют', () => {
  const parent = fakeEl({ 'data-private': '1' }, 'form');
  const child = fakeEl({}, 'input');
  child.parentElement = parent;
  eq(LF.Guard.isInsidePrivate(child), true);
});
test('blacklist: точный домен', () => {
  eq(LF.Guard.isBlacklisted('online.sberbank.ru', ['online.sberbank.ru']), true);
  eq(LF.Guard.isBlacklisted('sberbank.ru', ['online.sberbank.ru']), false);
});
test('blacklist: поддомен', () => {
  eq(LF.Guard.isBlacklisted('www.online.sberbank.ru', ['online.sberbank.ru']), true);
});
test('blacklist: маска *.example.com', () => {
  eq(LF.Guard.isBlacklisted('a.example.com', ['*.example.com']), true);
  eq(LF.Guard.isBlacklisted('example.com', ['*.example.com']), true);
  eq(LF.Guard.isBlacklisted('notexample.com', ['*.example.com']), false);
});
test('decide: пароль запрещён', () => {
  const v = LF.Guard.decide(fakeEl({ type: 'password' }), 'example.com', []);
  eq(v.allow, false);
  eq(v.reason, 'private-field');
});
test('decide: blacklist запрещён', () => {
  const v = LF.Guard.decide(fakeEl({ type: 'text' }), 'online.sberbank.ru', ['online.sberbank.ru']);
  eq(v.allow, false);
  eq(v.reason, 'blacklist');
});
test('decide: обычное поле разрешено', () => {
  const v = LF.Guard.decide(fakeEl({ type: 'text' }), 'example.com', []);
  eq(v.allow, true);
});

// ---------- RingBuffer ----------

console.log('\nRingBuffer');
test('push/tail FIFO', () => {
  const b = new LF.RingBuffer.RingBuffer(4);
  for (const ch of 'abcd') b.push(ch);
  eq(b.tail(4), 'abcd');
});
test('переполнение затирает старое', () => {
  const b = new LF.RingBuffer.RingBuffer(4);
  for (const ch of 'abcdefgh') b.push(ch);
  eq(b.tail(4), 'efgh');
  eq(b.length, 4);
});
test('pop', () => {
  const b = new LF.RingBuffer.RingBuffer(8);
  for (const ch of 'hello') b.push(ch);
  b.pop(2);
  eq(b.tail(), 'hel');
});
test('clear', () => {
  const b = new LF.RingBuffer.RingBuffer(8);
  for (const ch of 'hello') b.push(ch);
  b.clear();
  eq(b.length, 0);
});
test('lastWord', () => {
  const b = new LF.RingBuffer.RingBuffer(64);
  for (const ch of 'привет мир') b.push(ch);
  eq(b.lastWord(), 'мир');
});

// ---------- Settings (с моком storage) ----------

console.log('\nSettings');
test('load/save через мок storage', async () => {
  const store = { data: {} };
  const mock = {
    get(keys, cb) { cb(store.data); },
    set(obj, cb) { Object.assign(store.data, obj); cb && cb(); }
  };
  LF.Settings._setStorage(mock);
  const s = await LF.Settings.load();
  eq(s.enabled, true);
  eq(s.confidenceThreshold, 90);
  await LF.Settings.save({ enabled: false });
  const s2 = await LF.Settings.load();
  eq(s2.enabled, false);
  eq(store.data.settings.enabled, false);
});

// ---------- Итог ----------

console.log(`\nИтог: ${passed} ok, ${failed} failed, всего ${passed + failed}`);
if (failed > 0) {
  process.exit(1);
}
