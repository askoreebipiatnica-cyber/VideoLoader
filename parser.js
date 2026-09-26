"use strict";
/* Чистые функции: извлечение видеоссылок. Не зависят от chrome.* — покрыты тестами. */
(function (root) {
  const api = {};

  /** Allowlist схемы для любых сетевых действий и закачек: только http(s).
   *  [SEC-FIX SEC-02] Блокирует javascript:/data:/file:/blob: из DOM страницы. */
  api.isSafeHttpUrl = function (u) {
    if (typeof u !== "string") return false;
    const s = u.trim();
    if (s.length < 8 || s.length > 2048) return false;
    try {
      const p = new URL(s);
      return p.protocol === "http:" || p.protocol === "https:";
    } catch { return false; }
  };

  /** Нормализация вставленной ссылки. */
  api.normalizeInput = function (raw) {    let s = String(raw || "").trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString();
    } catch { return null; }
  };

  /** Похоже ли на прямой медиафайл. */
  api.isDirectMedia = function (url) {
    return /\.(mp4|webm|m4v|mov|ogv)(\?|#|$)/i.test(String(url || ""));
  };

  /** Похоже ли на прямой аудиофайл (музыка VK и др.). */
  api.isDirectAudio = function (url) {
    return /\.(mp3|m4a|m4b|ogg|oga|opus|wav|flac|aac)(\?|#|$)/i.test(String(url || ""));
  };

  /** Похоже ли на медиа вообще: файл, известный CDN-хост или потоковый URL.
   *  [SEC-FIX] Режет гифки/картинки/скрипты из DOM до того, как они попадут в захват. */
  api.isMediaish = function (url) {
    const u = String(url || "");
    if (api.isDirectMedia(u) || api.isDirectAudio(u)) return true;
    if (api.isPlaylist(u, "")) return true;
    if (/videoplayback|mime=video|mime=audio/i.test(u)) return true;
    return /cdninstagram|fbcdn|googlevideo|tiktokcdn|tiktokv|vxtiktok|akamaihd/i.test(u);
  };

  /** Это HLS/DASH плейлист. */
  api.isPlaylist = function (url, contentType) {
    const u = String(url || "");
    const ct = String(contentType || "").toLowerCase();
    if (/\.m3u8(\?|#|$)/i.test(u) || ct.includes("mpegurl")) return "hls";
    if (/\.mpd(\?|#|$)/i.test(u) || ct.includes("dash+xml")) return "dash";
    return null;
  };

  /** Достать видео-URL из HTML страницы: og:video / twitter:player:stream. */
  api.extractFromHtml = function (html, baseUrl) {
    const out = [];
    const seen = new Set();
    const push = (u) => {
      if (!u || seen.has(u)) return;
      seen.add(u);
      try { out.push(new URL(u, baseUrl).toString()); } catch { /* skip */ }
    };
    const metas = html.match(/<meta[^>]+>/gi) || [];
    for (const m of metas) {
      const prop = (m.match(/(?:property|name)=["']([^"']+)["']/i) || [])[1] || "";
      const content = (m.match(/content=["']([^"']+)["']/i) || [])[1] || "";
      if (!content) continue;
      const p = prop.toLowerCase();
      if (p === "og:video:secure_url" || p === "og:video:url" || p === "og:video" || p === "twitter:player:stream"
        || p === "og:audio:secure_url" || p === "og:audio:url" || p === "og:audio") {
        if (/^https?:\/\//i.test(content) || content.startsWith("/")) push(content);
      }
    }
    return out;
  };

  /** Достать прогрессивные mp4-потоки YouTube из HTML watch-страницы (без дешифровки).
   *  Скобки балансируем вручную: ленивый regex обрезается на первом вложенном "};" реального ответа. */
  api.extractYouTube = function (html) {
    const urls = [];
    const key = "ytInitialPlayerResponse";
    const ki = html.indexOf(key);
    if (ki < 0) return urls;
    const start = html.indexOf("{", ki + key.length);
    if (start < 0) return urls;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { end = i + 1; break; }
        if (depth < 0) break;
      }
    }
    if (end < 0) return urls;
    let data;
    try { data = JSON.parse(html.slice(start, end)); } catch { return urls; }
    const fmts = (((data || {}).streamingData || {}).formats) || [];
    for (const f of fmts) {
      if (f.url && /video\/mp4/i.test(f.mimeType || "")) urls.push(f.url);
    }
    return urls;
  };

  /** Безопасное имя файла. */
  api.safeFilename = function (name, fallbackExt) {
    let base = String(name || "video").split(/[?#]/)[0].split("/").pop() || "video";
    base = base.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "video";
    // Зарезервированные имена Windows: CON, PRN, AUX, NUL, COM1-9, LPT1-9
    const stem = base.replace(/\.[a-z0-9]{2,5}$/i, "");
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) base = "_" + base;
    if (!/\.[a-z0-9]{2,5}$/i.test(base)) base += fallbackExt || ".mp4";
    return base;
  };

  /** Расширение по Content-Type: аудио и видео разводим явно. */
  api.extByContentType = function (ct) {
    const c = String(ct || "").toLowerCase();
    if (c.includes("audio/")) {
      if (c.includes("ogg") || c.includes("opus")) return ".ogg";
      if (c.includes("wav") || c.includes("wave")) return ".wav";
      if (c.includes("flac")) return ".flac";
      if (c.includes("aac")) return ".aac";
      if (c.includes("mp4") || c.includes("m4a")) return ".m4a";
      return ".mp3";
    }
    if (c.includes("webm")) return ".webm";
    if (c.includes("quicktime")) return ".mov";
    if (c.includes("ogg")) return ".ogv";
    return ".mp4";
  };

  /** Человекочитаемый размер. */
  api.humanSize = function (bytes) {
    const n = Number(bytes);
    if (!(n > 0)) return "";
    if (n < 1048576) return Math.round(n / 1024) + " КБ";
    if (n < 1073741824) return (n / 1048576).toFixed(1) + " МБ";
    return (n / 1073741824).toFixed(2) + " ГБ";
  };

  /** Прямые video_url из встроенного JSON страницы (так цельный файл прячут IG/FB).
   *  Сайты-качалки берут то же самое, только своим сервером. */
  api.extractInlineVideoUrls = function (html, base) {
    const out = [];
    const seen = new Set();
    const push = (u) => {
      if (!u || seen.has(u)) return;
      if (!/^https?:\/\//i.test(u)) return;
      if (!/\.(mp4|webm|m4v|mov|ogv)(\?|#|$)/i.test(u)
        && !/cdninstagram|fbcdn|googlevideo|tiktokcdn|tiktokv|vxtiktok|mime=video/i.test(u)) return;
      seen.add(u);
      out.push(u);
    };
    const re = /"video_?[Uu]rl"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      try {
        let u = JSON.parse('"' + m[1] + '"');
        if (u.startsWith("/")) {
          try { u = new URL(u, base).toString(); } catch { continue; }
        }
        push(u);
      } catch { /* битый фрагмент — пропускаем */ }
    }
    return out;
  };
  /** Первые байты — начало цельного MP4 ('ftyp')? Фрагменты ('moof'/'sidx') VLC не открывает. */
  api.hasFtypMp4 = function (bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (b.length < 8) return false;
    return b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // "ftyp"
  };

  /** Строгая проверка начала файла: ftyp + (mdat в первых 64К | большой размер).
   *  Отсекает init-сегменты (ftyp+moov без медиа, ~1 КБ), которые старой проверке проходили. */
  api.checkMp4Head = function (bytes, totalSize) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!api.hasFtypMp4(b)) return false;
    for (let i = 0; i + 4 <= b.length && i < 65536; i++) {
      if (b[i] === 0x6d && b[i + 1] === 0x64 && b[i + 2] === 0x61 && b[i + 3] === 0x74) return true; // "mdat"
    }
    const total = Number(totalSize) || 0;
    return total > 200 * 1024;
  };

  /** Журнал скачиваний: новые сверху, максимум 7, без дублей по downloadId. Чистая. */
  api.pushHistory = function (list, entry) {
    const arr = Array.isArray(list) ? list.slice() : [];
    const out = [entry, ...arr.filter((x) => x && x.downloadId !== entry.downloadId)];
    return out.slice(0, 7);
  };

  /** Начало аудиофайла: ID3 / OggS / fLaC / RIFF-WAVE / MPEG-sync / m4a-ftyp. */
  api.hasAudioHead = function (bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (b.length < 4) return false;
    if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true; // "ID3"
    if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return true; // "OggS"
    if (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) return true; // "fLaC"
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return true; // "RIFF"
    if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return true; // MPEG frame sync
    return api.hasFtypMp4(b); // m4a
  };

  /** Начало WebM/Matroska (EBML magic). */
  api.hasEbmlHead = function (bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    return b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
  };

  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  /** Shortcode -> numeric media id (как у yt-dlp _id_to_pk). Чистая функция. */
  api.shortcodeToPk = function (sc) {
    let s = String(sc || "");
    if (s.length > 28) s = s.slice(0, -28);
    if (!s.length || !/^[A-Za-z0-9-_]+$/.test(s)) return null;
    let n = 0n;
    for (const c of s) n = n * 64n + BigInt(B64.indexOf(c));
    return n.toString();
  };

  /** LSD-токен из главной страницы (нужен GraphQL без входа). */
  api.extractLsdToken = function (html) {
    const m = String(html || "").match(/\["LSD",\[\],\{"token":"([^"]+)"/);
    return m ? m[1] : null;
  };

  /** Все video_versions из ответа API (info endpoint или GraphQL polaris). */
  api.extractVideoVersions = function (obj) {
    const out = [];
    const seen = new Set();
    const push = (u) => {
      if (typeof u === "string" && /^https?:\/\//i.test(u) && !seen.has(u)) { seen.add(u); out.push(u); }
    };
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (Array.isArray(o.video_versions)) o.video_versions.forEach((v) => { if (v && v.url) push(v.url); });
      for (const k of Object.keys(o)) { if (k !== "video_versions") walk(o[k]); }
    };
    try { walk(obj); } catch { /* кривой JSON — отдаём что нашли */ }
    return out;
  };

  /** Shortcode поста Instagram из ссылки (p / reel / reels / tv). */
  api.instagramShortcode = function (url) {
    const m = String(url || "").match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    return m ? m[1] : null;
  };

  /** Embed-страница поста: часто отдаёт og:video без входа. */
  api.embedUrl = function (url) {
    const code = api.instagramShortcode(url);
    return code ? "https://www.instagram.com/p/" + code + "/embed/captioned/" : null;
  };

  /** Прямая ссылка TikTok из JSON страницы (playAddr/downloadAddr, экранированные). */
  api.extractTikTok = function (html) {
    const out = [];
    const re = /"(?:playAddr|downloadAddr)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      try {
        const u = JSON.parse('"' + m[1] + '"');
        if (/^https?:\/\//i.test(u) && !out.includes(u)) out.push(u);
      } catch { /* битый фрагмент — пропускаем */ }
    }
    return out;
  };

  root.VideoLoaderParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
