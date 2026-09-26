// End-to-end: цепочка resolveDownload на фикстурах, chrome/fetch подменены.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FTYP = [0, 0, 0, 24, 102, 116, 121, 112];
const MOOF = [0, 0, 0, 16, 109, 111, 111, 102];
const FULL = [...FTYP, 0, 0, 0, 32, 109, 100, 97, 116, 1, 2, 3, 4]; // ftyp + mdat
const INIT = [...FTYP, 0, 0, 0, 12, 109, 111, 111, 118]; // ftyp + moov, без медиа (как твой 818-байтный файл)
const ID3 = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0]; // mp3-заголовок

const IG_HTML =
  `<html><head><meta property="og:video" content="https://cdn.test/frag.mp4"></head>` +
  `<body><script>{"video_url":"https:\\/\\/cdn.test\\/full.mp4?x=1"}</script></body></html>`;
const FRAG_ONLY_HTML =
  `<html><body><script>{"video_url":"https://cdn.test/frag.mp4"}</script></body></html>`;

function makeFetch(routes) {
  return async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith("http://127.0.0.1:8765/status")) {
      if (routes.helper === "up" || routes.helper === "up-fail") {
        return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => '{"ok":true}', arrayBuffer: async () => new Uint8Array(0).buffer };
      }
      throw new Error("connect refused");
    }
    if (u.startsWith("http://127.0.0.1:8765/download")) {
      const body = routes.helper === "up"
        ? '{"ok":true,"file":"/file/v.mp4","filename":"v.mp4"}'
        : '{"ok":false,"error":"nope"}';
      if (!routes.helper) throw new Error("connect refused");
      return {
        ok: true, status: 200, headers: { get: () => "application/json" },
        text: async () => body, json: async () => JSON.parse(body),
        arrayBuffer: async () => new Uint8Array(0).buffer,
      };
    }
    const range = opts.headers && opts.headers.Range;
    const bytes = (arr, ct, total) => ({
      ok: true,
      status: range ? 206 : 200,
      headers: {
        get: (n) => {
          const k = String(n).toLowerCase();
          if (k === "content-type") return ct;
          if (k === "content-range") return total ? `bytes 0-${arr.length - 1}/${total}` : null;
          return null;
        },
      },
      text: async () => routes.text(u),
      arrayBuffer: async () => new Uint8Array(arr).buffer,
    });
    if (opts.method === "HEAD") {
      return { ok: true, status: 200, headers: { get: (n) => (String(n).toLowerCase() === "content-type" ? "text/html" : null) } };
    }
    if (u.includes("frag.mp4")) return bytes(MOOF, "video/mp4", 19263);
    if (u.includes("init.mp4")) return bytes(INIT, "video/mp4", 818);
    if (u.includes("full.mp4")) return bytes(FULL, "video/mp4", 5000000);
    if (u.includes("track.mp3")) return bytes(ID3, "audio/mpeg", 4000000);
    if (u.includes("/api/v1/media/") || u.includes("/api/graphql")) {
      if (!routes.api) throw new Error("ig api blocked");
      const j = JSON.stringify({ items: [{ video_versions: [{ url: "https://cdn.test/full.mp4", width: 720 }] }] });
      return {
        ok: true, status: 200, headers: { get: () => "application/json" },
        text: async () => j, json: async () => JSON.parse(j),
        arrayBuffer: async () => new Uint8Array(0).buffer,
      };
    }
    return { ok: true, status: 200, headers: { get: () => "text/html" }, text: async () => routes.text(u), arrayBuffer: async () => new Uint8Array(0).buffer };
  };
}

function makeCtx(routes) {
  const calls = [];
  const store = {};
  let msgFn = null;
  const sandbox = {
    console,
    setTimeout, clearTimeout,
    AbortController, Blob, URL,
    URLSearchParams,
    fetch: makeFetch(routes),
    chrome: {
      webRequest: { onResponseStarted: { addListener() {} } },
      tabs: { onRemoved: { addListener() {} }, query: async () => [],
        sendMessage: async () => {
          if (routes.tabFail) throw new Error("Could not establish connection. Receiving end does not exist.");
          return { cands: routes.tabCands || [] };
        } },
      downloads: {
        download: async (o) => { calls.push(o); return 7; },
        cancel: async () => {},
        erase: async () => {},
        removeFile: async () => {},
        show: async () => {},
        onChanged: { addListener() {} },
      },
      runtime: { onMessage: { addListener(fn) { msgFn = fn; } } },
      storage: {
        local: {
          get: async (k) => (k && store[k] !== undefined ? { [k]: store[k] } : {}),
          set: async (o) => { Object.assign(store, o); },
        },
      },
    },
    importScripts: (...files) => {
      for (const f of files) vm.runInContext(fs.readFileSync(path.join(DIR, f), "utf8"), ctx, { filename: f });
    },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, "background.js"), "utf8"), ctx, { filename: "background.js" });
  const send = (m) => new Promise((res) => msgFn(m, {}, res));
  return { ctx, calls, store, send };
}

let pass = 0, fail = 0;
function eq(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + "\n  got:  " + a + "\n  want: " + b); }
}

// Сценарий 1: og:video — фрагмент, video_url — цельный => качаем video_url
{
  const { ctx, calls } = makeCtx({ text: () => IG_HTML });
  const r = await vm.runInContext(`resolveDownload("https://www.instagram.com/reel/ABC123/", 1, null)`, ctx);
  eq("chain ig downloads page video", { ok: r.ok, note: r.note }, { ok: true, note: "page" });
  eq("chain ig url is full", calls.length === 1 && calls[0].url, "https://cdn.test/full.mp4?x=1");
  eq("chain ig filename mp4", calls.length === 1 && calls[0].filename.endsWith(".mp4"), true);
}

// Сценарий 2: везде только фрагменты => честный nofile, мусора нет
{
  const { ctx, calls } = makeCtx({ text: () => FRAG_ONLY_HTML });
  const r = await vm.runInContext(`resolveDownload("https://www.instagram.com/reel/ZZZ/", 1, null)`, ctx);
  eq("chain frag-only nofile", { ok: r.ok, code: r.code }, { ok: false, code: "NOFILE" });
  eq("chain frag-only no downloads", calls.length, 0);
}

// Сценарий 3: прямая ссылка на цельный mp4
{
  const { ctx, calls, store } = makeCtx({ text: () => "" });
  const r = await vm.runInContext(`resolveDownload("https://cdn.test/full.mp4", 1, null)`, ctx);
  eq("chain direct ok", { ok: r.ok, note: r.note }, { ok: true, note: "direct" });
  eq("chain direct one download", calls.length, 1);
  const h = store["vl-history"] || [];
  eq("chain history saved", h.length, 1);
  eq("chain history filename", h[0] && h[0].filename.endsWith(".mp4"), true);
}

// Сценарий 4: страница пустая, но вкладка отдаёт цельный URL из DOM
{
  const { ctx, calls } = makeCtx({ text: () => "<html></html>", tabCands: ["https://cdn.test/full.mp4"] });
  const r = await vm.runInContext(`resolveDownload("https://www.instagram.com/reel/ABC123/", 1, null)`, ctx);
  eq("chain tab ok", { ok: r.ok, note: r.note }, { ok: true, note: "tab" });
  eq("chain tab url", calls.length === 1 && calls[0].url, "https://cdn.test/full.mp4");
}

// Сценарий 5: init-сегмент (ftyp+moov без медиа) — не качаем, честный nofile
{
  const { ctx, calls } = makeCtx({ text: () => "" });
  const r = await vm.runInContext(`resolveDownload("https://cdn.test/init.mp4", 1, null)`, ctx);
  eq("chain init nofile", { ok: r.ok, code: r.code }, { ok: false, code: "NOFILE" });
  eq("chain init no downloads", calls.length, 0);
}

// Сценарий 6: вкладка без content-script (открыта до обновления) — без падения, needPlayback
{
  const { ctx, calls } = makeCtx({ text: () => "<html></html>", tabFail: true });
  const r = await vm.runInContext(`resolveDownload("https://www.instagram.com/reel/ABC123/", 1, null)`, ctx);
  eq("chain no-content-script needPlayback", { ok: r.ok, needPlayback: r.needPlayback }, { ok: false, needPlayback: true });
  eq("chain no-content-script no downloads", calls.length, 0);
}

// Сценарий 7: помощник поднят — качаем через него первым делом
{
  const { ctx, calls } = makeCtx({ text: () => "<html></html>", helper: "up" });
  const r = await vm.runInContext(`resolveDownload("https://www.instagram.com/reel/ABC123/", 1, null)`, ctx);
  eq("chain helper ok", { ok: r.ok, note: r.note }, { ok: true, note: "helper" });
  eq("chain helper url", calls.length === 1 && calls[0].url, "http://127.0.0.1:8765/file/v.mp4");
}

// Сценарий 8: помощник упал — откат на встроенную цепочку
{
  const { ctx, calls } = makeCtx({ text: () => IG_HTML, helper: "up-fail" });
  const r = await vm.runInContext(`resolveDownload("https://www.instagram.com/reel/ABC123/", 1, null)`, ctx);
  eq("chain helper-fail fallback", { ok: r.ok, note: r.note }, { ok: true, note: "page" });
  eq("chain helper-fail url", calls.length === 1 && calls[0].url, "https://cdn.test/full.mp4?x=1");
}

// Сценарий 9: помощник упал и цепочка пуста — показываем ошибку помощника, а не generic
{
  const { ctx, calls } = makeCtx({ text: () => "<html></html>", helper: "up-fail" });
  const r = await vm.runInContext(`resolveDownload("https://www.instagram.com/reel/ABC123/", 1, null)`, ctx);
  eq("chain helper-err surfaced", r.ok, false);
  eq("chain helper-err code", { code: r.code, detail: String(r.detail || "") }, { code: "HELPER_FAIL", detail: "nope" });
  eq("chain helper-err no downloads", calls.length, 0);
}

// Сценарий 10: журнал — DEL_FILE чистит запись, CLEAR_HIST чистит всё
{
  const { ctx, calls, store, send } = makeCtx({ text: () => "" });
  await vm.runInContext(`resolveDownload("https://cdn.test/full.mp4", 1, null)`, ctx);
  eq("chain hist has entry", (store["vl-history"] || []).length, 1);
  const del = await send({ type: "DEL_FILE", id: 7 });
  eq("chain del ok", del && del.ok, true);
  eq("chain del cleared", (store["vl-history"] || []).length, 0);
  await vm.runInContext(`resolveDownload("https://cdn.test/full.mp4", 1, null)`, ctx);
  eq("chain hist re-added", (store["vl-history"] || []).length, 1);
  const clr = await send({ type: "CLEAR_HIST" });
  eq("chain clear ok", clr && clr.ok, true);
  eq("chain clear emptied", (store["vl-history"] || []).length, 0);
  eq("chain downloads happened", calls.length, 2);
}

// Сценарий 10: Instagram API отдаёт video_versions — качаем через api
{
  const { ctx, calls } = makeCtx({ text: () => "<html></html>", api: true });
  const r = await vm.runInContext(`resolveDownload("https://www.instagram.com/reel/ABC123/", 1, null)`, ctx);
  eq("chain ig-api ok", { ok: r.ok, note: r.note }, { ok: true, note: "api" });
  eq("chain ig-api url", calls.length === 1 && calls[0].url, "https://cdn.test/full.mp4");
}

// Сценарий 11: og:audio (музыка VK) — качаем mp3
{
  const html = `<html><head><meta property="og:audio" content="https://cs.test/track.mp3"></head></html>`;
  const { ctx, calls } = makeCtx({ text: () => html });
  const r = await vm.runInContext(`resolveDownload("https://vk.ru/audio-2001997256_148997256", 1, null)`, ctx);
  eq("chain audio ok", { ok: r.ok, note: r.note }, { ok: true, note: "og:video" });
  eq("chain audio url", calls.length === 1 && calls[0].url, "https://cs.test/track.mp3");
}

// Сценарий 12: гифка из вкладки — пропускаем, закачек нет
{
  const { ctx, calls } = makeCtx({ text: () => "<html></html>", tabCands: ["https://x.test/a.gif"] });
  const r = await vm.runInContext(`resolveDownload("https://vk.ru/audio-1_2", 1, null)`, ctx);
  eq("chain gif skipped", { ok: r.ok, needPlayback: r.needPlayback }, { ok: false, needPlayback: true });
  eq("chain gif no downloads", calls.length, 0);
}

// Сценарий 11: data:-URL из страницы отклоняется, закачек нет
{
  const { ctx, calls, send } = makeCtx({ text: () => "" });
  const r = await send({ type: "DOWNLOAD", url: "data:text/html,<script>alert(1)</script>", title: "x" });
  eq("chain data-url blocked", r.ok, false);
  eq("chain data-url no downloads", calls.length, 0);
}

// Сценарий 12: javascript:-ссылка во вставке отклоняется
{
  const { ctx, calls } = makeCtx({ text: () => "" });
  const r = await vm.runInContext(`resolveDownload("javascript:alert(1)", 1, null)`, ctx);
  eq("chain js-url blocked", r.ok, false);
  eq("chain js-url no downloads", calls.length, 0);
}

console.log(`\nCHAIN pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
