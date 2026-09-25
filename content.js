"use strict";
/* Content-script: следит за <video>, сообщает фону + отдаёт кандидатов из DOM. */
if (!globalThis.__vlLoaded) {
globalThis.__vlLoaded = true;

/* Мёртвый контекст (расширение обновилось, а вкладка старая): умираем тихо,
 * иначе каждые 5 секунд сыплется "Extension context invalidated". */
let vlDead = false;
let vlTimer = 0;
function vlCleanup() {
  vlDead = true;
  try { clearInterval(vlTimer); } catch { /* ignore */ }
}
function vlSend(msg) {
  if (vlDead) return;
  try {
    const rt = typeof chrome !== "undefined" && chrome.runtime ? chrome.runtime : null;
    if (!rt || !rt.sendMessage) { vlCleanup(); return; }
    const p = rt.sendMessage(msg);
    if (p && typeof p.catch === "function") p.catch(() => vlCleanup());
  } catch { vlCleanup(); }
}

function scrapeInline() {
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (!/^https?:\/\//i.test(u)) return;
    seen.add(u);
    out.push(u);
  };
  try {
    // 1. video_url из встроенного JSON страницы (там цельный файл)
    const html = document.documentElement.innerHTML || "";
    const re = /"video_?[Uu]rl"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    let n = 0;
    while ((m = re.exec(html)) !== null && n < 20) {
      n++;
      try {
        const u = JSON.parse('"' + m[1] + '"');
        if (/\.(mp4|webm|m4v|mov|ogv)(\?|#|$)/i.test(u) || /cdninstagram|fbcdn|googlevideo|tiktokcdn|tiktokv|vxtiktok/i.test(u)) push(u);
      } catch { /* битый фрагмент — пропускаем */ }
    }
    // 2. Ресурсы, которые реально тянул плеер
    try {
      performance.getEntriesByType("resource").forEach((r) => {
        const u = r.name || "";
        if (/^https?:\/\//i.test(u) && !/\.(css|js|woff2?|ttf|png|jpe?g|gif|svg|webp|json|ico)(\?|#|$)/i.test(u)) push(u);
      });
    } catch { /* performance закрыт — пропускаем */ }
  } catch { /* страница без доступа — отдаём пусто */ }
  return out.slice(0, 30);
}

function videoState() {
  const v = document.querySelector("video");
  if (!v) return null;
  return { paused: v.paused, time: v.currentTime || 0, duration: v.duration || 0 };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "GET_INLINE_CANDIDATES") return false;
  sendResponse({ cands: scrapeInline() });
  return false;
});

let reported = false;
function reportPlayback() {
  if (vlDead || reported) return;
  const st = videoState();
  if (!st || st.paused || st.time <= 0) return;
  reported = true;
  vlSend({
    type: "VIDEO_PLAYING",
    pageUrl: location.href,
    pageTitle: document.title,
    duration: st.duration,
    cands: scrapeInline(),
  });
}

document.addEventListener(
  "play",
  (e) => {
    if (e.target && e.target.tagName === "VIDEO") setTimeout(reportPlayback, 1500);
  },
  true
);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) setTimeout(reportPlayback, 400);
});
vlTimer = setInterval(reportPlayback, 5000);
} // __vlLoaded
