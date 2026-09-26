/**
 * Сборка релизных ZIP для Chrome Web Store и Firefox Add-ons (AMO).
 *
 * В dist/ кладутся два архива:
 *   layoutfix-chrome-v<version>.zip   — манифест как есть (MV3 service worker)
 *   layoutfix-firefox-v<version>.zip  — манифест с browser_specific_settings
 *                                       и background.scripts вместо service_worker
 *
 * В архив попадает только рантайм: manifest.json, _locales/, icons/, src/.
 * Тесты, инструменты и документация в ZIP не включаются.
 *
 * Запуск: node tools/package.mjs   (из корня layoutfix/ или где угодно — пути относные)
 */
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, statSync, rmSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
mkdirSync(distDir, { recursive: true });

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;

// Рантайм-файлы, попадающие в ZIP (whitelist)
const RUNTIME = ['manifest.json', '_locales', 'icons', 'src'];

// ---------- Копирование рантайма во временную папку ----------

const tmp = mkdtempSync(join(tmpdir(), 'layoutfix-pkg-'));

function copyRuntime(dst) {
  for (const name of RUNTIME) {
    const s = join(root, name);
    if (!existsSync(s)) throw new Error(`Ожидаемый файл/папка отсутствуют: ${name}`);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}

// ---------- Минимальный STORE-ZIP без зависимостей ----------

function makeCrcTable() {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}

const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let crc = -1;
  for (const b of buf) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ b) & 0xff];
  return (crc ^ -1) >>> 0;
}

function zipDir(dir, outZip) {
  const files = [];
  (function walk(d, prefix) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const rel = prefix ? prefix + '/' + name : name;
      if (statSync(p).isDirectory()) walk(p, rel);
      else files.push(rel);
    }
  })(dir, '');
  files.sort();

  const entries = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const data = readFileSync(join(dir, f));
    const nameBuf = Buffer.from(f, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);    // version needed
    local.writeUInt16LE(0, 6);     // flags
    local.writeUInt16LE(0, 8);     // method: store
    local.writeUInt16LE(0, 10);    // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    entries.push(local, nameBuf, data);

    const ce = Buffer.alloc(46);
    ce.writeUInt32LE(0x02014b50, 0);
    ce.writeUInt16LE(20, 4);       // version made by
    ce.writeUInt16LE(20, 6);       // version needed
    ce.writeUInt16LE(0, 8);        // flags
    ce.writeUInt16LE(0, 10);       // method: store
    ce.writeUInt16LE(0, 12);       // time
    ce.writeUInt16LE(0x21, 14);    // date
    ce.writeUInt32LE(crc, 16);
    ce.writeUInt32LE(data.length, 20);
    ce.writeUInt32LE(data.length, 24);
    ce.writeUInt16LE(nameBuf.length, 28);
    ce.writeUInt16LE(0, 30);       // extra len
    ce.writeUInt16LE(0, 32);       // comment len
    ce.writeUInt16LE(0, 34);       // disk number
    ce.writeUInt16LE(0, 36);       // internal attrs
    ce.writeUInt32LE(0, 38);       // external attrs
    ce.writeUInt32LE(offset, 42);
    central.push(ce, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  writeFileSync(outZip, Buffer.concat([...entries, centralBuf, eocd]));
}

// ---------- Сборка двух вариантов ----------

function build(variant, manifestOverride) {
  const pkg = join(tmp, variant);
  mkdirSync(pkg, { recursive: true });
  copyRuntime(pkg);
  if (manifestOverride) {
    writeFileSync(join(pkg, 'manifest.json'), JSON.stringify(manifestOverride, null, 2));
  }
  const outZip = join(distDir, `layoutfix-${variant}-v${version}.zip`);
  zipDir(pkg, outZip);
  return outZip;
}

// Chrome: манифест как есть
const chromeZip = build('chrome', null);

// Firefox: browser_specific_settings + background.scripts (event page) вместо service_worker
const ffManifest = {
  ...manifest,
  browser_specific_settings: {
    gecko: {
      id: 'layoutfix@localhost',
      // 142.0 — минимальная версия с поддержкой data_collection_permissions (AMO без предупреждений)
      strict_min_version: '142.0',
      // Обязательный для новых расширений ключ: расширение не собирает данные
      data_collection_permissions: { required: ['none'] }
    }
  },
  background: {
    scripts: ['src/background/service-worker.js'],
    type: 'module'
  }
};
const firefoxZip = build('firefox', ffManifest);

rmSync(tmp, { recursive: true, force: true });

for (const zip of [chromeZip, firefoxZip]) {
  const size = statSync(zip).size;
  console.log(`Готово: ${zip} (${size} байт)`);
}
console.log(`\nВерсия ${version}: chrome + firefox ZIP в dist/`);
