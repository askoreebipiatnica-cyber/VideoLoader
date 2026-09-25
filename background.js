"use strict";
/* Service worker: перехват медиапотоков + скачивание по ссылке. */
// [COMPAT] Firefox MV3 понимает chrome.*; запасной вариант — browser.*.
var chrome = globalThis.chrome || globalThis.browser;
importScripts("parser.js");
const P = globalThis.VideoLoaderParser;

/** tabId -> [{url,label,kind,title,size,at}] */
const detected = new Map();
const MAX_PER_TAB = 30;

function remember(tabId, item) {
  if (tabId == null || tabId < 0) return;
  // [SEC-FIX SEC-02] Отсев на входе: только строки http(s), иначе чужеродный URL из страницы
  // никогда не попадёт в detected/авто/журнал.
  if (!item || typeof item.url !== "string" || !P.isSafeHttpUrl(item.url)) return;
  const list = detected.get(tabId) || [];
  if (list.some((x) => x.url === item.url)) return;
  list.unshift({ ...item, at: Date.now() });
  detected.set(tabId, list.slice(0, MAX_PER_TAB));
}

function header(headers, name) {
  const h = (headers || []).find((x) => String(x.name || "").toLowerCase() === name);
  return h ? h.value : "";
}

/* Перехват ответов: видео, HLS, DASH, прямые файлы. */
chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    const url = details.url || "";
    if (/^blob:/i.test(url) || /^data:/i.test(url)) return;
    const ct = header(details.responseHeaders, "content-type");
    const len = header(details.responseHeaders, "content-length");
    const bytes = parseInt(len, 10) || 0;
    const pl = P.isPlaylist(url, ct);
    if (pl) {
      remember(details.tabId, {
        url, kind: "hls", label: pl === "hls" ? "HLS" : "DASH",
        size: P.humanSize(len), bytes, title: "",
      });
      return;
    }
    if (/^video\//i.test(ct) || P.isDirectMedia(url) || /videoplayback/i.test(url)) {
      remember(details.tabId, {
        url, kind: "file",
        label: /webm/i.test(ct + url) ? "WEBM" : "MP4",
        size: P.humanSize(len), bytes, title: "",
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener((tabId) => {
  detected.delete(tabId);
  autoState.delete(tabId);
});

/* --- Авто-скачивание: само сохраняет цельный файл, когда видео пошло --- */
const autoState = new Map(); // tabId -> {status, at, label}
const AUTO_MIN_INTERVAL = 60_000; // не чаще раза в минуту на вкладку

async function autoPref() {
  const { autoDownload = false } = await chrome.storage.local.get("autoDownload");
  return autoDownload === true;
}

function autoBlocked(tabId) {
  const s = autoState.get(tabId);
  if (!s) return false;
  if (s.status === "done" && Date.now() - s.at < AUTO_MIN_INTERVAL) return true;
  return false;
}

/** Попытка авто-сохранения: только цельный файл, мелочь и эфиры пропускаем. */
async function autoCapture(tabId) {
  if (tabId == null || tabId < 0) return;
  if (active) return; // пользователь что-то делает руками — не мешаем
  if (autoBlocked(tabId)) return;
  const s = autoState.get(tabId) || {};
  if (s.busy) return;
  autoState.set(tabId, { ...s, busy: true, status: "wait", at: s.at || Date.now() });

  const dur = s.duration || 0;
  if (dur === Infinity) {
    autoState.set(tabId, { status: "wait", at: Date.now(), label: "LIVE" });
    return;
  }
  if (dur > 0 && dur < 3) {
    autoState.set(tabId, { status: "wait", at: Date.now(), label: "SHORT" });
    return;
  }
  const found = await probeTab(tabId);
  if (found.kind !== "playable") {
    autoState.set(tabId, { status: "wait", at: Date.now(), label: "WAIT" });
    return;
  }
  const items = detected.get(tabId) || [];
  // Мелочь <256 КБ (анимации, звуки интерфейса) — пропускаем
  const big = found.urls.filter((u) => {
    const it = items.find((x) => x.url === u);
    const b = it ? it.bytes || 0 : 0;
    return b === 0 || b >= 256 * 1024;
  });
  if (!big.length) {
    autoState.set(tabId, { status: "wait", at: Date.now(), label: "SMALL" });
    return;
  }
  const best = items.find((x) => big.includes(x.url));
  if (best) {
    await runOp("auto", "AUTO", async () => {
      await doDownload(best.url, best.title || "");
    }).catch(() => {});
    autoState.set(tabId, { status: "done", at: Date.now(), label: "SAVED" });
  } else {
    autoState.set(tabId, { status: "wait", at: Date.now(), label: "WAIT" });
  }
}

/** Что в сети на вкладке: есть ли цельный MP4 (ftyp). */
async function probeTab(tabId) {
  const items = (detected.get(tabId) || []).filter((x) => x.kind === "file" || x.kind === "page").slice(0, 12);
  if (!items.length) return { kind: "none", urls: [] };
  const results = await Promise.all(items.map(async (f) => ({ f, p: await probeOne(f.url) })));
  const playable = results.filter((r) => r.p === "playable").map((r) => r.f.url);
  if (playable.length) return { kind: "playable", urls: playable };
  if (results.some((r) => r.p === "fragment")) return { kind: "fragment", urls: [] };
  return { kind: "none", urls: [] };
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function doDownload(url, title, extHint) {
  // [SEC-FIX SEC-02] Финальный шлюз: качаем только http(s). Всё остальное (data:, blob:, javascript:)
  // из DOM страницы или сообщений сюда дойти не должно.
  if (!P.isSafeHttpUrl(url)) throw new Error("bad url scheme");
  // [SEC-FIX SEC-03] title обязан быть строкой, иначе safeFilename получит мусор.
  const safeTitle = typeof title === "string" ? title : "";
  let host = "video";
  try { host = new URL(url).hostname.replace(/^www\./, "").split(".")[0] || host; } catch { /* keep */ }
  // Человеческое имя: заголовок страницы, иначе host+дата. Хэш из CDN-ссылки не тащим.
  const defExt = extHint || ".mp4";
  let filename;
  if (safeTitle && safeTitle.length > 2 && safeTitle.length < 80) {
    filename = P.safeFilename(safeTitle, defExt);
  } else {
    filename = P.safeFilename(`${host}-${stamp()}`, defExt);
  }
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop() || "";
    const m = last.match(/\.(mp4|webm|mov|ogv)$/i);
    if (m) filename = filename.replace(/\.[a-z0-9]{2,5}$/i, "") + m[0].toLowerCase();
  } catch { /* fallback уже есть */ }
  const id = await chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false });
  trackDownload(id, filename);
  await saveHist({ filename, url, at: Date.now(), downloadId: id, state: "started" });
  return { ok: true, filename, id };
}

async function headContentType(url, signal) {
  try {
    const r = await fetchWithTimeout(url, { method: "HEAD", credentials: "include" }, 10000, signal);
    return r.headers.get("content-type") || "";
  } catch (e) {
    if (signal && signal.aborted) throw signal.reason;
    return "";
  }
}

/** fetch с таймаутом: зависшие запросы (Instagram любит молчать) не вешают кнопку.
 *  extSignal — внешняя отмена (кнопка СТОП / новая операция). */
async function fetchWithTimeout(url, opts, ms, extSignal) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("timeout")), ms || 15000);
  const onAbort = () => ctrl.abort(extSignal.reason);
  if (extSignal) {
    if (extSignal.aborted) { clearTimeout(t); throw extSignal.reason; }
    extSignal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await fetch(url, { ...(opts || {}), signal: ctrl.signal });
  } finally {
    clearTimeout(t);
    if (extSignal) extSignal.removeEventListener("abort", onAbort);
  }
}

/* Активная операция: переживает закрытие popup (живёт в service worker),
 * остановить можно только кнопкой СТОП. */
let active = null; // {kind,label,ctrl,downloadId}

function isCancel(e) {
  return e && (e.name === "AbortError" || /cancelled/i.test(e.message || ""));
}

/** Запуск fetch-операции: предыдущая fetch-фаза гасится, закачки браузера не трогаем. */
async function runOp(kind, label, fn) {
  if (active && active.ctrl) {
    try { active.ctrl.abort(new Error("superseded")); } catch { /* ignore */ }
  }
  const ctrl = new AbortController();
  active = { kind, label, ctrl, downloadId: 0 };
  try {
    return await fn(ctrl.signal);
  } catch (e) {
    if (isCancel(e)) return { ok: false, cancelled: true, error: "Остановлено." };
    throw e;
  } finally {
    if (active && active.ctrl === ctrl && !active.downloadId) active = null;
  }
}

function trackDownload(id, label) {
  if (active) { active.downloadId = id; active.ctrl = null; active.label = label; }
  else active = { kind: "download", label, ctrl: null, downloadId: id };
}

let lastDl = null; // {ok, filename?, error?, at} — итог последней закачки для popup

let histCache = null;
async function getHist() {
  if (histCache) return histCache;
  try {
    const { "vl-history": h } = await chrome.storage.local.get("vl-history");
    histCache = Array.isArray(h) ? h : [];
  } catch { histCache = []; }
  return histCache;
}
async function saveHist(entry) {
  const list = await getHist();
  histCache = P.pushHistory(list, entry);
  try { await chrome.storage.local.set({ "vl-history": histCache }); } catch { /* ignore */ }
}
async function markHist(id, patch) {
  const list = await getHist();
  const i = list.findIndex((x) => x && x.downloadId === id);
  if (i >= 0) {
    histCache = list.slice();
    histCache[i] = { ...histCache[i], ...patch };
    try { await chrome.storage.local.set({ "vl-history": histCache }); } catch { /* ignore */ }
  }
}

chrome.downloads.onChanged.addListener((d) => {
  if (active && d.id === active.downloadId && d.state && d.state.current !== "in_progress") {
    if (d.state.current === "complete") {
      lastDl = { ok: true, filename: active.label, at: Date.now() };
      markHist(d.id, { state: "done" }).catch(() => {});
    } else {
      lastDl = { ok: false, error: (d.error && d.error.current) || "interrupted", at: Date.now() };
      markHist(d.id, { state: "failed" }).catch(() => {});
    }
    active = null;
  }
});

async function cancelActive() {
  const a = active;
  if (!a) return { ok: false, error: "Нечего останавливать." };
  if (a.ctrl) {
    try { a.ctrl.abort(new Error("cancelled")); } catch { /* ignore */ }
  }
  if (a.downloadId) {
    try { await chrome.downloads.cancel(a.downloadId); } catch { /* ignore */ }
    try { await chrome.downloads.erase({ id: a.downloadId }); } catch { /* ignore */ }
  }
  active = null;
  return { ok: true };
}

/** Проверка начала файла: цельное видео или фрагмент/инит.
 *  [SEC-FIX SEC-09] Читаем только первые 64 КБ через reader + cancel: сервер, игнорирующий
 *  Range и отдающий тело целиком, иначе положил бы service worker в OOM. */
async function probeOne(url, signal) {
  // [SEC-FIX SEC-02] Не ходим fetch за пределы http(s).
  if (!P.isSafeHttpUrl(url)) return "unknown";
  try {
    const r = await fetchWithTimeout(url, { headers: { Range: "bytes=0-65535" }, credentials: "include" }, 10000, signal);
    if (!r.ok && r.status !== 206) return "unknown";
    const ct = String(r.headers.get("content-type") || "").toLowerCase();
    let total = 0;
    const cr = String(r.headers.get("content-range") || "");
    const m = cr.match(/\/(\d+)\s*$/);
    if (m) total = parseInt(m[1], 10) || 0;
    let buf;
    if (r.body && typeof r.body.getReader === "function") {
      const reader = r.body.getReader();
      try {
        const chunks = [];
        let len = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (value && value.length && len < 65536) { chunks.push(value); len += value.length; }
          if (done || len >= 65536) break;
        }
        buf = new Uint8Array(Math.min(len, 65536));
        let off = 0;
        for (const c of chunks) {
          const n = Math.min(c.length, 65536 - off);
          buf.set(c.subarray ? c.subarray(0, n) : c.slice(0, n), off);
          off += n;
          if (off >= 65536) break;
        }
      } finally {
        try { await reader.cancel(); } catch { /* ignore */ }
      }
    } else {
      buf = new Uint8Array(await r.arrayBuffer()).slice(0, 65536);
    }
    if (!buf.length) return "unknown";
    if (/webm|matroska/.test(ct)) return P.hasEbmlHead(buf) ? "playable" : "fragment";
    if (/video\//.test(ct) || !ct || /mp4|quicktime|octet-stream/.test(ct)) {
      return P.checkMp4Head(buf, total) ? "playable" : "fragment";
    }
    return "unknown";
  } catch (e) {
    if (signal && signal.aborted) throw signal.reason;
    return "unknown";
  }
}

/** Запасной вариант: если для вкладки уже пойман цельный поток — скачать его.
 *  Фрагменты DASH молча пропускаем (проверяем первые байты, максимум 3 кандидата). */
async function tryCaught(tabId, signal) {
  if (active) active.label = "CHECK_CAUGHT";
  const list = (tabId != null && detected.get(tabId)) || [];
  const cands = [
    ...list.filter((x) => x.kind === "file" && x.label === "MP4"),
    ...list.filter((x) => !(x.kind === "file" && x.label === "MP4")),
  ].slice(0, 6);
  let sawFragment = false, checked = 0;
  for (const c of cands) {
    if (signal) signal.throwIfAborted();
    if (checked >= 3) break;
    checked++;
    const probe = await probeOne(c.url, signal);
    if (probe === "fragment") { sawFragment = true; continue; }
    const dl = await doDownload(c.url, c.title || "", probe === "playable" ? undefined : P.extByContentType(""));
    return { ...dl, note: "caught" };
  }
  if (sawFragment) return { ok: false, code: "NOFILE" };
  return null;
}

/** Кандидаты из открытой вкладки: DOM уже залогинен, там есть то, чего нет фоновым запросом.
 *  Если вкладка открыта давно (скрипт туда не вшит после обновления) — вшиваем сами. */
async function askTab(tabId, signal) {
  if (tabId == null || tabId < 0) return [];
  const collect = async () => {
    const r = await chrome.tabs.sendMessage(tabId, { type: "GET_INLINE_CANDIDATES" });
    // [SEC-FIX SEC-03] Принимаем только массив строк; схемы режет remember().
    const c = (r && r.cands) || [];
    return Array.isArray(c) ? c.filter((u) => typeof u === "string").slice(0, 30) : [];
  };
  let cands;
  try {
    cands = await collect();
  } catch (e) {
    try {
      if (signal) signal.throwIfAborted();
      if (!chrome.scripting || !chrome.scripting.executeScript) return [];
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      cands = await collect();
    } catch { return []; }
  }
  for (const u of cands.slice(0, 20)) {
    if (!u || /^blob:/i.test(u)) continue;
    const pl = P.isPlaylist(u, "");
    remember(tabId, {
      url: u, kind: pl ? "hls" : "page",
      label: pl ? "HLS" : "PAGE",
      title: "", size: "", bytes: 0,
    });
  }
  return cands;
}

/** Локальный помощник (yt-dlp): то, что умеют сайты-качалки, но на твоей машине. */
const HELPER = "http://127.0.0.1:8765";
let helperCache = { at: 0, up: false };

async function helperUp() {
  if (Date.now() - helperCache.at < 30_000) return helperCache.up;
  try {
    const r = await fetchWithTimeout(HELPER + "/status", {}, 3000);
    helperCache = { at: Date.now(), up: r.ok };
  } catch {
    helperCache = { at: Date.now(), up: false };
  }
  return helperCache.up;
}

async function helperDownload(url, signal) {
  const r = await fetchWithTimeout(
    HELPER + "/download",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) },
    240000, signal
  );
  const j = await r.json();
  if (!j || !j.ok || !j.file) throw new Error((j && j.error) || "helper failed");
  if (active) active.label = "Качаю";
  const dl = await doDownload(HELPER + j.file, j.filename || "");
  return { ...dl, note: "helper" };
}

/** Instagram API как у yt-dlp: info endpoint (вход) -> GraphQL Polaris (гость).
 *  Отдаёт цельные video_versions даже когда страница login-walled. */
const IG_APP_ID = "936619743392459";
function igHeaders(extra) {
  return {
    "X-IG-App-ID": IG_APP_ID,
    "X-ASBD-ID": "359341",
    "X-IG-WWW-Claim": "0",
    "Origin": "https://www.instagram.com",
    "Accept": "*/*",
    ...(extra || {}),
  };
}

async function igApiDownload(shortcode, pageUrl, signal) {
  const pk = P.shortcodeToPk(shortcode);
  if (!pk) return null;
  const tryUrls = async (urls) => {
    for (const u of (urls || []).slice(0, 3)) {
      if (signal) signal.throwIfAborted();
      if ((await probeOne(u, signal)) === "playable") {
        const dl = await doDownload(u, "");
        return { ...dl, note: "api" };
      }
    }
    return null;
  };
  // 1. Залогиненный info endpoint
  try {
    const r = await fetchWithTimeout(
      `https://www.instagram.com/api/v1/media/${pk}/info/`,
      { credentials: "include", headers: igHeaders({ Referer: pageUrl }) },
      20000, signal
    );
    const hit = await tryUrls(P.extractVideoVersions(await r.json()));
    if (hit) return hit;
  } catch (e) {
    if (signal && signal.aborted) throw signal.reason;
  }
  // 2. Гостевой GraphQL
  try {
    const home = await (
      await fetchWithTimeout("https://www.instagram.com/", { credentials: "include", headers: igHeaders() }, 20000, signal)
    ).text();
    const lsd = P.extractLsdToken(home);
    const body = new URLSearchParams({
      lsd: lsd || "",
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "PolarisLoggedOutDesktopWWWPostRootContentQuery",
      server_timestamps: "true",
      variables: JSON.stringify({ media_id: pk }),
      doc_id: "27130156389949648",
    });
    const r = await fetchWithTimeout(
      "https://www.instagram.com/api/graphql",
      {
        method: "POST",
        credentials: "include",
        headers: igHeaders({
          "X-FB-Friendly-Name": "PolarisLoggedOutDesktopWWWPostRootContentQuery",
          "X-FB-LSD": lsd || "",
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: pageUrl,
        }),
        body: body.toString(),
      },
      25000, signal
    );
    const hit = await tryUrls(P.extractVideoVersions(await r.json()));
    if (hit) return hit;
  } catch (e) {
    if (signal && signal.aborted) throw signal.reason;
  }
  return null;
}

/** Вставленная ссылка -> помощник -> прямой файл / вкладка / og:video / video_url / TikTok / YouTube. */
async function resolveDownload(raw, tabId, signal) {
  const stage = (s) => { if (active) active.label = s; };
  const url = P.normalizeInput(raw);
  // [i18n] Тексты ошибок живут в _locales; фон отдаёт коды, popup переводит.
  if (!url) return { ok: false, code: "BAD_URL" };
  if (P.isPlaylist(url, "")) return { ok: false, code: "PLAYLIST" };

  // Сначала помощник (yt-dlp локально): умеет то же, что сайты-качалки
  let helperError = "";
  if (await helperUp()) {
    stage("DOWNLOAD");
    try {
      return await helperDownload(url, signal);
    } catch (e) {
      if (signal && signal.aborted) throw signal.reason;
      helperError = String((e && e.message) || e);
      // помощник не справился — идём по встроенной цепочке
    }
  }
  const helperFail = () => ({ ok: false, code: "HELPER_FAIL", detail: helperError });

  stage("OPEN_LINK");
  const ct = await headContentType(url, signal);
  if (/^video\//i.test(ct) || (P.isDirectMedia(url) && !P.isPlaylist(url, ct))) {
    stage("DOWNLOAD");
    if ((await probeOne(url, signal)) === "fragment") {
      return { ok: false, code: "NOFILE" };
    }
    const dl = await doDownload(url, "", P.extByContentType(ct));
    return { ...dl, note: "direct" };
  }
  if (P.isPlaylist(url, ct)) return { ok: false, code: "PLAYLIST" };

  stage("OPEN_PAGE");
  let html = "";
  try {
    const r = await fetchWithTimeout(url, { credentials: "include" }, 25000, signal);
    const t = await r.text();
    html = t.slice(0, 2_000_000);
  } catch (e) {
    if (signal && signal.aborted) throw signal.reason;
    // Фоновая загрузка не прошла — спрашиваем саму вкладку (там вход уже есть)
    stage("ASK_TAB");
    const tabUrls = await askTab(tabId, signal);
    for (const u of tabUrls.slice(0, 5)) {
      if (signal) signal.throwIfAborted();
      if ((await probeOne(u, signal)) === "playable") {
        stage("DOWNLOAD");
        const dl = await doDownload(u, "");
        return { ...dl, note: "tab" };
      }
    }
    const caught = await tryCaught(tabId, signal);
    if (caught) return caught;
    return { ok: false, code: "SITE_TIMEOUT" };
  }

  stage("FIND_URL");
  const og = P.extractFromHtml(html, url);
  let sawFragment = false;
  if (og.length) {
    if ((await probeOne(og[0], signal)) !== "fragment") {
      stage("DOWNLOAD");
      const dl = await doDownload(og[0], "");
      return { ...dl, note: "og:video" };
    }
    sawFragment = true;
  }
  // Цельный файл из встроенного JSON страницы (video_url) — то же берут сайты-качалки
  const inline = P.extractInlineVideoUrls(html, url);
  for (const u of inline.slice(0, 3)) {
    if (signal) signal.throwIfAborted();
    if ((await probeOne(u, signal)) === "playable") {
      stage("DOWNLOAD");
      const dl = await doDownload(u, "");
      return { ...dl, note: "page" };
    }
    sawFragment = true;
  }
  const noFile = () => ({ ok: false, code: "NOFILE" });
  // Instagram API (info + GraphQL Polaris): цельные video_versions
  const sc = P.instagramShortcode(url);
  if (sc) {
    stage("CHECK_API");
    const hit = await igApiDownload(sc, url, signal);
    if (hit) return hit;
  }
  // TikTok: playAddr из JSON страницы (как save-сервисы парсят разметку)
  if (/tiktok\.com\//i.test(url)) {
    stage("CHECK_TT");
    const tt = P.extractTikTok(html);
    if (tt.length && (await probeOne(tt[0], signal)) !== "fragment") {
      stage("DOWNLOAD");
      const dl = await doDownload(tt[0], "");
      return { ...dl, note: "tiktok" };
    }
  }
  // Instagram: embed-страница часто отдаёт og:video без входа
  const emb = P.embedUrl(url);
  if (emb) {
    stage("CHECK_EMBED");
    try {
      const r = await fetchWithTimeout(emb, { credentials: "include" }, 20000, signal);
      const eh = (await r.text()).slice(0, 2_000_000);
      const og2 = P.extractFromHtml(eh, emb);
      if (og2.length && (await probeOne(og2[0], signal)) !== "fragment") {
        stage("DOWNLOAD");
        const dl = await doDownload(og2[0], "");
        return { ...dl, note: "embed" };
      }
    } catch (e) {
      if (signal && signal.aborted) throw signal.reason;
    }
  }
  if (/youtube\.com\/watch|youtu\.be\//i.test(url)) {
    stage("CHECK_YT");
    const yt = P.extractYouTube(html);
    if (yt.length) {
      stage("DOWNLOAD");
      const dl = await doDownload(yt[0], "");
      return { ...dl, note: "youtube" };
    }
  }
  // Последний шанс: спросить саму вкладку (залогиненный DOM видит больше фонового запроса)
  stage("ASK_TAB");
  const tabUrls = await askTab(tabId, signal);
  for (const u of tabUrls.slice(0, 5)) {
    if (signal) signal.throwIfAborted();
    if ((await probeOne(u, signal)) === "playable") {
      stage("DOWNLOAD");
      const dl = await doDownload(u, "");
      return { ...dl, note: "tab" };
    }
  }
  const caught = await tryCaught(tabId, signal);
  if (caught) return caught;
  if (helperError) return helperFail();
  return sawFragment ? noFile() : { ok: false, needPlayback: true };
}

/** [SEC-FIX SEC-01/SEC-03] Строгая валидация входящих сообщений:
 *  чужое расширение (sender.id) отрезаем сразу, поля проверяем по типам. */
function validTabId(v, sender) {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  const t = sender && sender.tab && sender.tab.id;
  return typeof t === "number" ? t : null;
}
function validStr(v, max) {
  if (typeof v !== "string") return "";
  return v.length > max ? v.slice(0, max) : v;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // [SEC-FIX SEC-01] Сообщения принимаем только из своих контекстов.
    if (sender && sender.id && sender.id !== chrome.runtime.id) return;
    if (!msg || typeof msg.type !== "string") return sendResponse(null);
    if (msg.type === "GET_DETECTED") {
      const tabId = validTabId(msg.tabId, sender);
      sendResponse(tabId == null ? [] : detected.get(tabId) || []);
    } else if (msg.type === "ADD_PAGE_VIDEOS") {
      // [SEC-FIX SEC-03] Элементы из DOM страницы: строгие типы, URL только http(s), длины режем.
      const items = Array.isArray(msg.items) ? msg.items : [];
      const tabId = validTabId(msg.tabId, sender);
      const title = validStr(msg.pageTitle, 200);
      for (const v of items) {
        if (!v || typeof v.url !== "string" || !P.isSafeHttpUrl(v.url)) continue;
        const pl = P.isPlaylist(v.url, "");
        remember(tabId, {
          url: v.url, kind: pl ? "hls" : "page",
          label: pl ? "HLS" : "PAGE",
          title: typeof v.title === "string" ? v.title.slice(0, 200) : title, size: "",
        });
      }
      sendResponse({ ok: true });
    } else if (msg.type === "DOWNLOAD") {
      try {
        // [SEC-FIX SEC-02/SEC-03] doDownload сам отклонит не-http(s); title режем.
        if (typeof msg.url !== "string") throw new Error("bad url");
        const probe = await probeOne(msg.url, null);
        if (probe === "fragment") {
          sendResponse({ ok: false, code: "NOFILE" });
        } else sendResponse(await doDownload(msg.url, msg.title || ""));
      }
      catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    } else if (msg.type === "RESOLVE_DOWNLOAD") {
      try {
        // [SEC-FIX SEC-03] url обязан быть строкой; tabId валидируем внутри resolveDownload через askTab.
        if (typeof msg.url !== "string") throw new Error("bad url");
        const tabId = validTabId(msg.tabId, sender);
        sendResponse(await runOp("fetch", "FETCH", (sig) => resolveDownload(msg.url, tabId, sig)));
      }
      catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    } else if (msg.type === "CANCEL") {
      try { sendResponse(await cancelActive()); }
      catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    } else if (msg.type === "VIDEO_PLAYING") {
      try {
        const tabId = validTabId(msg.tabId, sender);
        const title = validStr(msg.pageTitle, 200);
        // [SEC-FIX SEC-03] Кандидаты из страницы: только массив строк; remember() дополнительно режет схемы.
        const cands = Array.isArray(msg.cands) ? msg.cands.filter((u) => typeof u === "string").slice(0, 20) : [];
        if (tabId != null) {
          if (title) {
            const list = detected.get(tabId) || [];
            list.forEach((x) => { if (!x.title) x.title = title; });
            detected.set(tabId, list);
          }
          for (const u of cands) {
            if (!P.isSafeHttpUrl(u)) continue;
            const pl = P.isPlaylist(u, "");
            remember(tabId, {
              url: u, kind: pl ? "hls" : "page",
              label: pl ? "HLS" : "PAGE",
              title, size: "", bytes: 0,
            });
          }
          const prev = autoState.get(tabId) || {};
          // [SEC-FIX SEC-03] duration обязан быть конечным числом, иначе игнор.
          const dur = Number(msg.duration);
          autoState.set(tabId, { ...prev, duration: Number.isFinite(dur) ? dur : 0 });
        }
        if (await autoPref()) await autoCapture(tabId);
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    } else if (msg.type === "SET_AUTO") {
      try {
        await chrome.storage.local.set({ autoDownload: !!msg.value });
        sendResponse({ ok: true, value: !!msg.value });
      } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    } else if (msg.type === "GET_AUTO") {
      sendResponse({ value: await autoPref() });
    } else if (msg.type === "GET_STATUS") {
      const tabId = msg.tabId;
      const a = autoState.get(tabId);
      sendResponse({
        busy: !!active,
        label: active ? active.label : "",
        auto: a ? a.status : "",
        autoLabel: a ? a.label || "" : "",
        last: lastDl,
        helper: await helperUp(),
        history: await getHist(),
      });
    } else if (msg.type === "SHOW") {
      try {
        // [SEC-FIX SEC-03] id обязан быть числом.
        if (typeof msg.id !== "number" || !Number.isInteger(msg.id)) throw new Error("bad id");
        await chrome.downloads.show(msg.id);
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    } else if (msg.type === "DEL_FILE") {
      // Удаление файла с диска + из журнала
      try {
        // [SEC-FIX SEC-03] id обязан быть числом.
        if (typeof msg.id !== "number" || !Number.isInteger(msg.id)) throw new Error("bad id");
        try { await chrome.downloads.removeFile(msg.id); } catch { /* файла уже нет */ }
        try { await chrome.downloads.erase({ id: msg.id }); } catch { /* ignore */ }
        const list = await getHist();
        histCache = list.filter((x) => x && x.downloadId !== msg.id);
        try { await chrome.storage.local.set({ "vl-history": histCache }); } catch { /* ignore */ }
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    } else if (msg.type === "CLEAR_HIST") {
      // Чистка списка (файлы на диске не трогаем)
      try {
        const list = await getHist();
        for (const x of list) {
          if (x && x.downloadId != null) {
            try { await chrome.downloads.erase({ id: x.downloadId }); } catch { /* ignore */ }
          }
        }
        histCache = [];
        try { await chrome.storage.local.set({ "vl-history": [] }); } catch { /* ignore */ }
        sendResponse({ ok: true });
      } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    } else sendResponse(null);
  })();
  return true;
});
