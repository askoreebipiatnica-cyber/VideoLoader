"use strict";
/* Локальный помощник VideoLoader: принимает URL от расширения, качает через yt-dlp,
 * отдаёт готовый файл. Только localhost. Запуск: run-helper.bat */
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.VL_PORT || "8765", 10);
const DIR = __dirname;
const OUT = path.join(DIR, "out");
// [MACOS] Ищем yt-dlp везде: env -> рядом (win/mac) -> PATH (brew/pip).
function resolveYtdlp() {
  if (process.env.VL_YTDLP) {
    try { if (fs.existsSync(process.env.VL_YTDLP)) return process.env.VL_YTDLP; } catch { /* дальше */ }
  }
  for (const n of ["yt-dlp.exe", "yt-dlp"]) {
    try {
      const p = path.join(DIR, "..", n);
      if (fs.existsSync(p)) return p;
    } catch { /* дальше */ }
  }
  return "yt-dlp"; // из PATH: macOS/Linux (brew/pip), Windows при установке в PATH
}
const YTDLP = resolveYtdlp();
// [SEC-FIX SEC-07] Не больше двух yt-dlp одновременно (каждый живёт до 240с).
const MAX_RUNNING = 2;
let running = 0;
fs.mkdirSync(OUT, { recursive: true });

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function extOriginOk(req) {
  const o = req.headers.origin || "";
  if (!o) return true; // curl / без origin — локальные вызовы
  return /^chrome-extension:\/\/[a-z]+$/i.test(o);
}

// [RABBIT] Файлы, которые сейчас раздаём в /file/: чистка их не трогает.
// Счётчик, а не флаг: один файл могут читать два ответа одновременно.
const serving = new Map(); // name -> активных раздач
function servingAdd(name) {
  serving.set(name, (serving.get(name) || 0) + 1);
}
function servingRelease(name) {
  const n = (serving.get(name) || 1) - 1;
  if (n <= 0) serving.delete(name);
  else serving.set(name, n);
}

// Чистим файлы старше часа: на запросах + по расписанию (см. низ файла)
function sweep() {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(OUT)) {
      if (serving.has(f)) continue; // [RABBIT] не удаляем то, что сейчас читается
      const p = path.join(OUT, f);
      try {
        if (now - fs.statSync(p).mtimeMs > 3600_000) fs.unlinkSync(p);
      } catch { /* уже удалён */ }
    }
  } catch { /* не критично */ }
}

function runYtDlp(url, withCookies) {
  return new Promise((resolve) => {
    // [SEC-FIX SEC-07] Лимит параллельных yt-dlp: флуд POSTами иначе плодит процессы ×240с.
    if (running >= MAX_RUNNING) {
      resolve({ ok: false, error: "helper busy, retry later" });
      return;
    }
    running++;
    const tpl = path.join(OUT, "%(title).60s-%(id)s.%(ext)s");
    const args = [
      "--no-playlist", "--no-warnings", "--no-progress",
      "-f", "best[ext=mp4]/best",
    ];
    if (withCookies) args.push("--cookies-from-browser", "chrome");
    args.push("-o", tpl, "--print", "after_move:filepath", url);
    const t0 = Date.now();
    const p = spawn(YTDLP, args, { windowsHide: true, timeout: 240_000 });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", (e) => { running--; resolve({ ok: false, error: "yt-dlp не запустился: " + e.message }); });
    p.on("close", (code) => {
      running--;
      const lines = out.trim().split(/\r?\n/).filter(Boolean);
      const fp = lines.length ? lines[lines.length - 1].trim() : "";
      // [SEC-FIX SEC-08] Пустой файл за успех не считаем.
      let size = 0;
      try { size = fp && fs.existsSync(fp) ? fs.statSync(fp).size : 0; } catch { size = 0; }
      if (code === 0 && fp && size > 0) {
        resolve({ ok: true, path: fp, ms: Date.now() - t0 });
      } else {
        const msg = (err.trim().split(/\r?\n/).pop() || out.trim().split(/\r?\n/).pop() || ("exit " + code)).slice(0, 300);
        resolve({ ok: false, error: msg });
      }
    });
  });
}

const server = http.createServer((req, res) => {
  if (!extOriginOk(req)) return send(res, 403, { ok: false, error: "forbidden origin" });
  const u = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && u.pathname === "/status") {
    const p = spawn(YTDLP, ["--version"], { windowsHide: true, timeout: 15000 });
    let v = "";
    p.stdout.on("data", (d) => { v += d; });
    p.on("error", () => send(res, 500, { ok: false, error: "yt-dlp not found" }));
    p.on("close", (code) => {
      if (code === 0) send(res, 200, { ok: true, ytdlp: v.trim() });
      else if (!res.writableEnded) send(res, 500, { ok: false, error: "yt-dlp error" });
    });
    return;
  }
  if (req.method === "GET" && u.pathname.startsWith("/file/")) {
    const name = path.basename(u.pathname.slice(6));
    const fp = path.join(OUT, name);
    if (!name || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, {
      "Content-Type": /\.webm$/i.test(name) ? "video/webm" : "video/mp4",
      "Content-Length": fs.statSync(fp).size,
      "Content-Disposition": `attachment; filename="${name}"`,
    });
    // [RABBIT] Ошибка чтения без слушателя роняет процесс; файл в раздаче не чистим.
    // release() идемпотентен: error и close могут прийти парой на один ответ.
    servingAdd(name);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      servingRelease(name);
    };
    const st = fs.createReadStream(fp);
    st.on("error", () => {
      release();
      try { if (!res.headersSent) res.writeHead(500); res.end(); } catch { /* ignore */ }
    });
    res.on("close", release);
    st.pipe(res);
    return;
  }
  if (req.method === "POST" && u.pathname === "/download") {
    let body = "";
    req.on("data", (d) => { body += d; if (body.length > 4096) req.destroy(); });
    req.on("end", async () => {
      sweep();
      let url = "";
      try { url = JSON.parse(body).url || ""; } catch { return send(res, 400, { ok: false, error: "bad json" }); }
      if (!/^https?:\/\//i.test(url)) return send(res, 400, { ok: false, error: "bad url" });
      let r = await runYtDlp(url, true);
      if (!r.ok) r = await runYtDlp(url, false); // без куков — для публичных постов
      if (!r.ok) return send(res, 200, { ok: false, error: r.error });
      return send(res, 200, { ok: true, file: "/file/" + path.basename(r.path), filename: path.basename(r.path), ms: r.ms });
    });
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`VideoLoader helper on http://127.0.0.1:${PORT} (out: ${OUT})`);
});

// [RABBIT] Чистка по расписанию, а не только на запросах: без скачиваний
// старые файлы иначе лежали бы вечно.
sweep();
setInterval(sweep, 30 * 60 * 1000);
