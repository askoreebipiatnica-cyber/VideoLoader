/**
 * Семантическая валидация manifest.json для Chrome (MV3) и Firefox (AMO).
 * Проверки:
 *   - обязательные поля, формат версии;
 *   - все файлы, иконки, скрипты и страницы из манифеста существуют в репозитории;
 *   - ключи __MSG_xxx__ присутствуют в messages.json локали по умолчанию;
 *   - CSP-директивы Chrome MV3 (script-src 'self', object-src);
 *   - Firefox: browser_specific_settings.gecko.id валиден, suggested_key допустим.
 *
 * Запуск: node tools/validate-manifest.mjs [--firefox]
 *   без флага — валидация манифеста Chrome;
 *   с флагом  — валидация Firefox-варианта манифеста (с адаптациями, как в ZIP).
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const firefoxMode = process.argv.includes('--firefox');

const errors = [];
const warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// ---------- Загрузка манифеста ----------

const manifestPath = join(root, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(`✗ manifest.json не парсится: ${e.message}`);
  process.exit(1);
}

// Для Firefox применяем те же адаптации, что и при упаковке
if (firefoxMode) {
  manifest = {
    ...manifest,
    browser_specific_settings: {
      gecko: {
        id: 'layoutfix@localhost',
        strict_min_version: '142.0',
        data_collection_permissions: { required: ['none'] }
      }
    },
    background: {
      scripts: ['src/background/service-worker.js'],
      type: 'module'
    }
  };
}

// ---------- Общие проверки ----------

function checkCommon(m) {
  for (const field of ['manifest_version', 'name', 'version']) {
    if (!(field in m)) err(`отсутствует обязательное поле "${field}"`);
  }
  if (m.manifest_version !== 3) err(`manifest_version должен быть 3 (MV3), получено ${m.manifest_version}`);

  // Версия: 1-4 числовые части, каждая 0..65535 (Chromium/AMO)
  if (typeof m.version === 'string') {
    const parts = m.version.split('.');
    if (parts.length < 1 || parts.length > 4) err(`version "${m.version}": от 1 до 4 числовых частей`);
    for (const p of parts) {
      if (!/^\d+$/.test(p)) err(`version "${m.version}": часть "${p}" не число`);
      else if (parseInt(p, 10) > 65535) err(`version "${m.version}": часть "${p}" > 65535`);
    }
  } else err('version должна быть строкой');

  // i18n: если name/description используют __MSG_*, проверяем наличие в default_locale
  if (typeof m.default_locale !== 'string') {
    if (/__MSG_/.test(m.name || '') || /__MSG_/.test(m.description || '')) {
      err('default_locale обязателен при использовании __MSG_*__');
    }
  } else {
    const locDir = join(root, '_locales', m.default_locale);
    if (!existsSync(locDir)) {
      err(`default_locale "${m.default_locale}" отсутствует в _locales/`);
    } else {
      let messages = {};
      try { messages = JSON.parse(readFileSync(join(locDir, 'messages.json'), 'utf8')); }
      catch (e) { err(`_locales/${m.default_locale}/messages.json не парсится: ${e.message}`); }
      const needed = new Set();
      for (const s of [m.name, m.description, m.commands && m.commands['convert-last'] && m.commands['convert-last'].description]) {
        const match = typeof s === 'string' && /__MSG_(\w+)__/.exec(s);
        if (match) needed.add(match[1]);
      }
      for (const key of needed) {
        if (!messages[key] || typeof messages[key].message !== 'string') {
          err(`ключ "${key}" отсутствует в _locales/${m.default_locale}/messages.json`);
        }
      }
      // Все локали должны определять одинаковый набор ключей
      for (const loc of readdirSync(join(root, '_locales'))) {
        const p = join(root, '_locales', loc, 'messages.json');
        if (!existsSync(p)) { warn(`в _locales/${loc} нет messages.json`); continue; }
        let data;
        try { data = JSON.parse(readFileSync(p, 'utf8')); }
        catch (e) { err(`_locales/${loc}/messages.json не парсится: ${e.message}`); continue; }
        for (const key of needed) {
          if (!data[key]) warn(`в _locales/${loc}/messages.json нет ключа "${key}" (есть в default_locale)`);
        }
      }
    }
  }

  // Иконки
  if (m.icons) {
    for (const [size, file] of Object.entries(m.icons)) {
      if (!existsSync(join(root, file))) err(`иконка ${size}px не найдена: ${file}`);
      else if (!/\.png$/.test(file)) warn(`иконка ${file} не PNG (рекомендуется PNG)`);
    }
  }

  // action
  if (m.action) {
    if (m.action.default_popup && !existsSync(join(root, m.action.default_popup))) {
      err(`action.default_popup не найден: ${m.action.default_popup}`);
    }
    if (m.action.default_icon) {
      for (const file of Object.values(m.action.default_icon)) {
        if (!existsSync(join(root, file))) err(`action.default_icon не найден: ${file}`);
      }
    }
  }

  // options_ui
  if (m.options_ui && m.options_ui.page && !existsSync(join(root, m.options_ui.page))) {
    err(`options_ui.page не найден: ${m.options_ui.page}`);
  }

  // content_scripts
  if (Array.isArray(m.content_scripts)) {
    for (const [i, cs] of m.content_scripts.entries()) {
      if (!Array.isArray(cs.matches) || cs.matches.length === 0) {
        err(`content_scripts[${i}]: отсутствует или пустой "matches"`);
      }
      for (const js of cs.js || []) {
        if (!existsSync(join(root, js))) err(`content_scripts[${i}].js не найден: ${js}`);
      }
      for (const css of cs.css || []) {
        if (!existsSync(join(root, css))) err(`content_scripts[${i}].css не найден: ${css}`);
      }
      if (cs.run_at && !['document_start', 'document_end', 'document_idle'].includes(cs.run_at)) {
        err(`content_scripts[${i}].run_at некорректен: ${cs.run_at}`);
      }
    }
  }

  // commands
  if (m.commands) {
    for (const [name, cmd] of Object.entries(m.commands)) {
      if (!cmd.description) err(`commands.${name}: отсутствует description`);
      if (cmd.suggested_key) {
        for (const [ctx, key] of Object.entries(cmd.suggested_key)) {
          if (!/^(Ctrl|Alt|Command|MacCtrl)(\+(Shift|Ctrl|Alt|Command|MacCtrl))*\+[A-Z0-9]$/.test(key)) {
            err(`commands.${name}.suggested_key.${ctx}: недопустимый формат "${key}"`);
          }
        }
      }
    }
  }
}

// ---------- Chrome-специфика ----------

function checkChrome(m) {
  // Разрешения: собираем фактически используемые chrome.* API в фоновом и UI-коде
  const allowed = new Set(['storage']);
  const used = new Set();
  const scanDirs = ['src/background', 'src/ui'];
  for (const dir of scanDirs) {
    for (const f of jsFiles(join(root, dir))) {
      const code = readFileSync(f, 'utf8');
      for (const api of /chrome\.([a-zA-Z]+)\./g.execAll(code)) {
        used.add(api[1]);
      }
      for (const api of /browser\.([a-zA-Z]+)\./g.execAll(code)) {
        used.add(api[1]);
      }
    }
  }
  // API, не требующие permissions:
  //  - runtime/storage/action/i18n — всегда доступны;
  //  - commands — команды объявляются ключом manifest.commands, отдельного права нет;
  //  - tabs — query/create/sendMessage работают без права; право "tabs" нужно
  //    только для чтения свойств вкладки (url, title, favIconUrl).
  const free = new Set(['runtime', 'storage', 'action', 'i18n', 'commands', 'tabs']);
  // Но если код читает свойства вкладок — право обязательно
  for (const dir of scanDirs) {
    for (const f of jsFiles(dir)) {
      if (/tab[s]?\.(url|title|favIconUrl)|\.url\s*=|tab\.url\b/.test(readFileSync(f, 'utf8'))) {
        err('Chrome: код читает url/title вкладки — требуется право "tabs" в permissions');
      }
    }
  }
  for (const api of used) {
    if (free.has(api)) continue;
    if (!allowed.has(api)) {
      err(`Chrome: используется chrome.${api}.* без права в permissions (нужен "${api}" или убрать использование)`);
    }
  }

  // MV3 background
  if (m.background) {
    if (!m.background.service_worker) {
      err('Chrome MV3: background.service_worker обязателен (если background задан)');
    }
    if (m.background.scripts) {
      err('Chrome MV3: background.scripts не поддерживается (это Firefox/legacy)');
    }
    if (m.background.service_worker && !existsSync(join(root, m.background.service_worker))) {
      err(`background.service_worker не найден: ${m.background.service_worker}`);
    }
  }

  // CSP MV3
  if (m.content_security_policy) {
    const csp = typeof m.content_security_policy === 'string'
      ? m.content_security_policy
      : m.content_security_policy.extension_pages;
    if (typeof m.content_security_policy === 'object' && !m.content_security_policy.extension_pages) {
      err('CSP: объект без ключа extension_pages');
    }
    if (typeof csp === 'string') {
      // script-src должен быть 'self' (+ wasm-unsafe-eval); remote code запрещён
      const scriptSrc = /script-src[^;]*/.exec(csp);
      if (!scriptSrc) warn("CSP: нет явной директивы script-src (по умолчанию 'self')");
      else if (!/'self'/.test(scriptSrc[0])) err("CSP: script-src должен содержать 'self' для MV3");
      if (/(https?:)?\/\//.test(scriptSrc && scriptSrc[0] || '')) {
        err('CSP: script-src содержит удалённые источники — запрещено в MV3');
      }
      const objectSrc = /object-src[^;]*/.exec(csp);
      if (!objectSrc) err("CSP: MV3 требует явную директиву object-src (например 'none')");
      else if (!/'none'/.test(objectSrc[0])) err("CSP: object-src должен быть 'none' для MV3");
      if (/connect-src[^;]*/.test(csp) && !/connect-src[^;]*'none'/.test(csp)) {
        warn("CSP: connect-src не 'none' — у расширения с zero-telemetry это должно быть 'none'");
      }
    }
  }

  // match_about_blank / all_frames допустимы; проверять нечего дополнительно
}

// ---------- Firefox-специфика ----------

function checkFirefox(m) {
  if (!m.browser_specific_settings || !m.browser_specific_settings.gecko) {
    err('Firefox: browser_specific_settings.gecko отсутствует — AMO отклонит загрузку без id');
  } else {
    const gecko = m.browser_specific_settings.gecko;
    if (!/^[a-zA-Z0-9-._]*@[a-zA-Z0-9-._]+$/.test(gecko.id || '')) {
      err(`Firefox: gecko.id "${gecko.id}" не соответствует формату email-like id`);
    }
    if (!gecko.strict_min_version) warn('Firefox: gecko.strict_min_version не задан');
  }

  if (m.background) {
    if (!m.background.scripts || !m.background.scripts.length) {
      err('Firefox: background.scripts обязательны для event-page адаптации MV3');
    }
    if (m.background.service_worker) {
      err('Firefox: background.service_worker не поддерживается Gecko — нужен scripts');
    }
    for (const s of m.background.scripts || []) {
      if (!existsSync(join(root, s))) err(`background.scripts не найден: ${s}`);
    }
  }

  // IE6-эпоха не нужна, но Gecko не любит некоторые ключи:
  if (m.options_ui && m.options_ui.browser_style) {
    warn('Firefox: options_ui.browser_style устарел (Gecko 112+)');
  }
}

// ---------- Утилиты ----------

function jsFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// RegExp.execAll (нет в прототипе)
if (!RegExp.prototype.execAll) {
  RegExp.prototype.execAll = function (str) {
    const results = [];
    let m;
    const g = new RegExp(this.source, this.flags.includes('g') ? this.flags : this.flags + 'g');
    while ((m = g.exec(str)) !== null) results.push(m);
    return results;
  };
}

// ---------- Запуск ----------

checkCommon(manifest);
if (firefoxMode) checkFirefox(manifest);
else checkChrome(manifest);

const target = firefoxMode ? 'Firefox (AMO)' : 'Chrome Web Store';
console.log(`\n=== Валидация manifest.json: ${target} ===`);
if (errors.length) {
  for (const e of errors) console.error(`  ✗ ОШИБКА: ${e}`);
}
if (warnings.length) {
  for (const w of warnings) console.warn(`  ⚠ ПРЕДУПРЕЖДЕНИЕ: ${w}`);
}
if (!errors.length && !warnings.length) {
  console.log('  ✓ Проблем не найдено');
}
console.log(`\nИтог: ошибок ${errors.length}, предупреждений ${warnings.length}`);
process.exit(errors.length ? 1 : 0);
