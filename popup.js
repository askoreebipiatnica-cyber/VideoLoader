"use strict";
/* Popup: тема, вставка ссылки, статус операции. */

const $ = (id) => document.getElementById(id);
const urlInput = $("url"), goBtn = $("go"), statusEl = $("status");
const autoHint = $("auto-hint"), autoSw = $("auto-sw");
const histCard = $("hist-card"), histEl = $("hist");
let lastShownAt = 0;

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cls ? " " + cls : "");
}

/** Результат операции: отмена — нейтрально, успех — зелёным, ошибка — красным. */
function showResult(res, okPrefix) {
  if (res && res.ok) setStatus((okPrefix || "Готово: ") + (res.filename || "файл"), "ok");
  else if (res && res.cancelled) setStatus("Остановлено.", "");
  else if (res && res.needPlayback) setStatus("Прямую ссылку не достать — включи «Авто-сохранение» ниже, открой это видео в браузере и нажми Play.", "err");
  else setStatus("Не вышло: " + ((res && res.error) || "unknown"), "err");
}

function showBusy(busy, label) {
  $("stop").style.display = busy ? "" : "none";
  goBtn.disabled = !!busy;
  if (busy && label) setStatus(label + "… (можно закрыть окно — докачаю, или жми Стоп)");
}

/* --- Тема: auto / light / dark --- */
async function initTheme() {
  const { "vl-theme": saved = "auto" } = await chrome.storage.local.get("vl-theme");
  applyTheme(saved);
  document.querySelectorAll("[data-set-theme]").forEach((b) => {
    b.classList.toggle("on", b.dataset.setTheme === saved);
    b.addEventListener("click", async () => {
      await chrome.storage.local.set({ "vl-theme": b.dataset.setTheme });
      applyTheme(b.dataset.setTheme);
      document.querySelectorAll("[data-set-theme]").forEach((x) =>
        x.classList.toggle("on", x === b));
    });
  });
}
function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
}

function fmtTime(at) {
  try {
    const d = new Date(at);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  } catch { return ""; }
}

function renderHist(items) {
  histEl.innerHTML = "";
  if (!items || !items.length) { histCard.style.display = "none"; return; }
  histCard.style.display = "";
  for (const it of items) {
    const li = document.createElement("li");
    li.className = "item";
    const dot = document.createElement("span");
    dot.className = "badge" + (it.state === "failed" ? " hls" : "");
    dot.textContent = it.state === "failed" ? "✕" : it.state === "done" ? "✓" : "…";
    dot.title = it.state || "";
    const meta = document.createElement("div");
    meta.className = "meta";
    const t = document.createElement("div");
    t.className = "t";
    t.textContent = it.filename || "файл";
    const u = document.createElement("div");
    u.className = "u";
    u.textContent = fmtTime(it.at);
    meta.append(t, u);
    li.append(dot, meta);
    if (it.downloadId != null) {
      const sh = document.createElement("button");
      sh.className = "btn mini";
      sh.textContent = "Показать";
      sh.addEventListener("click", async () => {
        const res = await chrome.runtime.sendMessage({ type: "SHOW", id: it.downloadId }).catch((e) => ({ ok: false, error: e.message }));
        if (!(res && res.ok)) setStatus("Не показать: " + ((res && res.error) || "unknown"), "err");
      });
      const del = document.createElement("button");
      del.className = "btn mini danger";
      del.textContent = "✕";
      del.title = "Удалить файл с диска";
      del.addEventListener("click", async () => {
        if (!confirm(`Удалить файл с диска?\n${it.filename || ""}`)) return;
        const res = await chrome.runtime.sendMessage({ type: "DEL_FILE", id: it.downloadId }).catch((e) => ({ ok: false, error: e.message }));
        if (res && res.ok) { setStatus("Файл удалён.", ""); refreshStatus(); }
        else setStatus("Не удалилось: " + ((res && res.error) || "unknown"), "err");
      });
      li.append(sh, del);
    }
    histEl.append(li);
  }
}

$("hist-clear").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "CLEAR_HIST" }).catch((e) => ({ ok: false, error: e.message }));
  if (res && res.ok) { setStatus("Журнал очищен (файлы на диске целы).", ""); refreshStatus(); }
  else setStatus("Не очистилось: " + ((res && res.error) || "unknown"), "err");
});

async function refreshStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const st = await chrome.runtime.sendMessage({ type: "GET_STATUS", tabId: tab && tab.id }).catch(() => null);
    if (!st) return;
    showBusy(!!st.busy, st.label);
    renderHist(st.history);
    if (st.auto) autoHint.textContent = st.auto === "done" ? (st.autoLabel || "готово") : "авто: сбор…";
    else autoHint.textContent = "";
    if (!st.busy && st.last && st.last.at !== lastShownAt) {
      lastShownAt = st.last.at;
      if (st.last.ok) setStatus("Готово: " + (st.last.filename || "файл"), "ok");
      else setStatus("Закачка сорвалась: " + (st.last.error || "unknown"), "err");
    }
  } catch (e) {
    setStatus("Фоновая служба недоступна: " + (e && e.message ? e.message : e), "err");
  }
}

goBtn.addEventListener("click", async () => {
  const raw = urlInput.value.trim();
  if (!raw) { setStatus("Вставьте ссылку.", "err"); return; }
  goBtn.disabled = true;
  setStatus("Разбираю ссылку…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.runtime.sendMessage({ type: "RESOLVE_DOWNLOAD", url: raw, tabId: tab && tab.id });
    showResult(res);
  } catch (e) {
    setStatus("Ошибка: " + e.message, "err");
  } finally {
    goBtn.disabled = false;
  }
  refreshStatus();
});

$("stop").addEventListener("click", async () => {
  setStatus("Останавливаю…");
  try {
    const res = await chrome.runtime.sendMessage({ type: "CANCEL" });
    if (res && res.ok) setStatus("Остановлено.", "");
    else setStatus("Нечего останавливать.", "");
  } catch (e) {
    setStatus("Ошибка: " + e.message, "err");
  }
  refreshStatus();
});

async function initAuto() {
  const r = await chrome.runtime.sendMessage({ type: "GET_AUTO" }).catch(() => null);
  autoSw.checked = !!(r && r.value);
  autoSw.addEventListener("change", async () => {
    await chrome.runtime.sendMessage({ type: "SET_AUTO", value: autoSw.checked });
  });
}

initTheme();
initAuto();
refreshStatus();
setInterval(refreshStatus, 1500);

/* Версия из манифеста — бампается в одном месте */
async function showFoot() {
  try {
    const st = await chrome.runtime.sendMessage({ type: "GET_STATUS" }).catch(() => null);
    const h = st && st.helper ? " · помощник вкл" : "";
    $("foot-ver").textContent = `VideoLoader ${chrome.runtime.getManifest().version}${h}`;
  } catch { /* popup без manifest — оставляем статичный текст */ }
}
showFoot();

/* Донат: открываем в новой вкладке, popup при этом не ломаем */
document.getElementById("donate").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "https://pay.cloudtips.ru/p/ac545b44" }).catch(() => {});
});
