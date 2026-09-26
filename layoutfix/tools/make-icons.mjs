/**
 * Генератор иконок: рисует простую «A/А»-плашку и кодирует PNG вручную
 * (zlib через node:zlib), без зависимостей. Запись: node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'icons');
mkdirSync(outDir, { recursive: true });

// ---------- Крошечный растеризатор ----------

function makeCanvas(size) {
  return { size, data: new Uint8Array(size * size * 4) };
}

function fill(c, r, g, b, a = 255) {
  for (let i = 0; i < c.data.length; i += 4) {
    c.data[i] = r; c.data[i + 1] = g; c.data[i + 2] = b; c.data[i + 3] = a;
  }
}

function roundedRect(c, x0, y0, x1, y1, rad, r, g, b, a = 255) {
  const rr = rad * rad;
  for (let y = Math.floor(y0); y < y1; y++) {
    for (let x = Math.floor(x0); x < x1; x++) {
      // расстояние до скругленных углов
      const dx = Math.max(x0 + rad - x, x - (x1 - rad), 0);
      const dy = Math.max(y0 + rad - y, y - (y1 - rad), 0);
      if (dx * dx + dy * dy <= rr) {
        const i = (y * c.size + x) * 4;
        c.data[i] = r; c.data[i + 1] = g; c.data[i + 2] = b; c.data[i + 3] = a;
      }
    }
  }
}

/** Пиксельная "A" и "А" (общий скелет) — 7 столбцов на 8 строк. */
const GLYPH = [
  '..XXX..',
  '.X...X.',
  '.X...X.',
  'X.....X',
  'XXXXXXX',
  'X.....X',
  'X.....X',
  '.X...X.'
];

function drawGlyph(c, gx, gy, scale, r, g, b, a = 255) {
  for (let row = 0; row < GLYPH.length; row++) {
    for (let col = 0; col < GLYPH[row].length; col++) {
      if (GLYPH[row][col] !== 'X') continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = gx + col * scale + dx;
          const y = gy + row * scale + dy;
          if (x < 0 || y < 0 || x >= c.size || y >= c.size) continue;
          const i = (y * c.size + x) * 4;
          c.data[i] = r; c.data[i + 1] = g; c.data[i + 2] = b; c.data[i + 3] = a;
        }
      }
    }
  }
}

/** Полумесяц — символ "другой раскладки", справа снизу. */
function drawCrescent(c, cx, cy, rad, r, g, b, a = 255) {
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= rad && d >= rad * 0.55 && dx <= 0) {
        const i = (y * c.size + x) * 4;
        c.data[i] = r; c.data[i + 1] = g; c.data[i + 2] = b; c.data[i + 3] = a;
      }
    }
  }
}

// ---------- PNG-кодировщик ----------

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(canvas) {
  const { size, data } = canvas;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  // фильтр 0 для каждой строки
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    data.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => {
      raw[y * (size * 4 + 1) + 1 + i] = v;
    });
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- Отрисовка размеров ----------

function drawIcon(size) {
  const c = makeCanvas(size);
  fill(c, 0, 0, 0, 0);
  const pad = Math.round(size * 0.06);
  roundedRect(c, pad, pad, size - pad, size - pad, size * 0.18, 23, 88, 46); // зелёный #17582e -> тёплый зелёный
  const s = size >= 48 ? 8 : size >= 32 ? 5 : 3;
  const glyphW = 7 * s;
  const gx = Math.round((size - glyphW) / 2);
  const gy = Math.round((size - 8 * s) / 2) - Math.round(s * 0.4);
  drawGlyph(c, gx, gy, s, 255, 255, 255);
  drawCrescent(c, size - pad - Math.round(size * 0.12), size - pad - Math.round(size * 0.12), Math.round(size * 0.1), 255, 214, 92);
  return c;
}

for (const size of [16, 32, 48, 128]) {
  const png = encodePNG(drawIcon(size));
  writeFileSync(join(outDir, `icon${size}.png`), png);
  console.log(`icons/icon${size}.png  (${png.length} bytes)`);
}
