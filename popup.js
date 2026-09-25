"use strict";
/* Popup: тема, язык, вставка ссылки, статус операции. */
// [COMPAT] Firefox: chrome.* есть в MV3, иначе берём browser.* (промисный стиль тот же).
var chrome = globalThis.chrome || globalThis.browser;

const $ = (id) => document.getElementById(id);
const urlInput = $("url"), goBtn = $("go"), statusEl = $("status");
const autoHint = $("auto-hint"), autoSw = $("auto-sw");
const histCard = $("hist-card"), histEl = $("hist");
let lastShownAt = 0;

/* --- i18n: словарь из _locales (единый источник), выбор языка в окне --- */
const LANGS = ["ru", "en", "de", "zh", "kk", "ko"];
let STR = {};
function t(k) { return STR[k] !== undefined ? STR[k] : k; }
function setText(id, s) { const el = $(id); if (el) el.textContent = s; }
function browserLang() {
  try {
    const u = String((chrome.i18n && chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : "en") || "en").toLowerCase();
    if (u.startsWith("zh")) return "zh";
    const s = u.split(/[-_]/)[0];
    return LANGS.includes(s) ? s : "en";
  } catch { return "en"; }
}
async function loadDict(lang) {
  STR = {};
  const chain = lang === "auto" ? [browserLang(), "en"] : [lang, "en"];
  for (const l of chain) {
    try {
      const r = await fetch(chrome.runtime.getURL(`_locales/${l}/messages.json`));
      const j = await r.json();
      for (const k of Object.keys(j)) {
        if (STR[k] === undefined && j[k] && typeof j[k].message === "string") STR[k] = j[k].message;
      }
    } catch { /* нет такой локали — дальше по цепочке */ }
  }
}
function applyStrings() {
  setText("lbl-url", t("ui_input_label"));
  urlInput.placeholder = t("ui_input_ph");
  goBtn.textContent = t("ui_download");
  $("stop").textContent = t("ui_stop");
  setText("auto-lbl", t("ui_auto"));
  setText("hist-title", t("ui_hist"));
  $("hist-clear").textContent = t("ui_clear");
  document.querySelector('[data-set-theme="light"]').title = t("ui_th_light");
  document.querySelector('[data-set-theme="auto"]').title = t("ui_th_auto");
  document.querySelector('[data-set-theme="dark"]').title = t("ui_th_dark");
  $("lang").title = t("ui_lang");
  setStatus(t("ui_status_default"));
}
async function initLang() {
  const { "vl-lang": saved = "auto" } = await chrome.storage.local.get("vl-lang");
  $("lang").value = saved;
  await loadDict(saved);
  applyStrings();
  $("lang").addEventListener("change", async (e) => {
    await chrome.storage.local.set({ "vl-lang": e.target.value });
    await loadDict(e.target.value);
    applyStrings();
    showFoot();
    refreshStatus();
  });
}

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cls ? " " + cls : "");
}

/** Текст ошибки фона: код -> локализованная строка (+ сырой detail для HELPER_FAIL). */
function errText(res) {
  if (res && typeof res.code === "string" && STR["err_" + res.code] !== undefined) {
    return STR["err_" + res.code] + (res.detail || "");
  }
  return (res && res.error) || t("ui_unknown");
}

/** Результат операции: отмена — нейтрально, успех — зелёным, ошибка — красным. */
function showResult(res, okPrefix) {
  if (res && res.ok) setStatus((okPrefix || t("ui_ok")) + (res.filename || t("ui_file")), "ok");
  else if (res && res.cancelled) setStatus(t("ui_stopped"), "");
  else if (res && res.needPlayback) setStatus(t("ui_needplay"), "err");
  else setStatus(t("ui_fail") + errText(res), "err");
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
  // [SEC-FIX SEC-04] replaceChildren вместо innerHTML: ноль HTML-парсинга даже статикой.
  histEl.replaceChildren();
  if (!Array.isArray(items) || !items.length) { histCard.style.display = "none"; return; }
  histCard.style.display = "";
  for (const it of items) {
    if (!it || typeof it !== "object") continue; // [SEC-FIX SEC-03] пропускаем мусор из хранилища
    const li = document.createElement("li");
    li.className = "item";
    const dot = document.createElement("span");
    dot.className = "badge" + (it.state === "failed" ? " hls" : "");
    dot.textContent = it.state === "failed" ? "✕" : it.state === "done" ? "✓" : "…";
    dot.title = it.state || "";
    const meta = document.createElement("div");
    meta.className = "meta";
    const tEl = document.createElement("div");
    tEl.className = "t";
    tEl.textContent = it.filename || t("ui_file");
    const u = document.createElement("div");
    u.className = "u";
    u.textContent = fmtTime(it.at);
    meta.append(tEl, u);
    li.append(dot, meta);
    if (it.downloadId != null) {
      const sh = document.createElement("button");
      sh.className = "btn mini";
      sh.textContent = t("ui_show");
      sh.addEventListener("click", async () => {
        const res = await chrome.runtime.sendMessage({ type: "SHOW", id: it.downloadId }).catch((e) => ({ ok: false, error: e.message }));
        if (!(res && res.ok)) setStatus(t("ui_no_show") + errText(res), "err");
      });
      const del = document.createElement("button");
      del.className = "btn mini danger";
      del.textContent = "✕";
      del.title = t("ui_del_title");
      del.addEventListener("click", async () => {
        if (!confirm(`${t("ui_del_confirm")}\n${it.filename || ""}`)) return;
        const res = await chrome.runtime.sendMessage({ type: "DEL_FILE", id: it.downloadId }).catch((e) => ({ ok: false, error: e.message }));
        if (res && res.ok) { setStatus(t("ui_deleted"), ""); refreshStatus(); }
        else setStatus(t("ui_not_deleted") + errText(res), "err");
      });
      li.append(sh, del);
    }
    histEl.append(li);
  }
}

$("hist-clear").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "CLEAR_HIST" }).catch((e) => ({ ok: false, error: e.message }));
  if (res && res.ok) { setStatus(t("ui_cleared"), ""); refreshStatus(); }
  else setStatus(t("ui_not_cleared") + errText(res), "err");
});

async function refreshStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const st = await chrome.runtime.sendMessage({ type: "GET_STATUS", tabId: tab && tab.id }).catch(() => null);
    if (!st) return;
    showBusy(!!st.busy, st.label);
    renderHist(st.history);
    if (st.auto) autoHint.textContent = st.auto === "done" ? (st.autoLabel || t("ui_auto_hint_done")) : t("ui_auto_hint_busy");
    else autoHint.textContent = "";
    if (!st.busy && st.last && st.last.at !== lastShownAt) {
      lastShownAt = st.last.at;
      if (st.last.ok) setStatus(t("ui_ok") + (st.last.filename || t("ui_file")), "ok");
      else setStatus(t("ui_dl_fail") + (st.last.error || t("ui_unknown")), "err");
    }
  } catch (e) {
    setStatus(t("ui_bg_down") + (e && e.message ? e.message : e), "err");
  }
}

goBtn.addEventListener("click", async () => {
  const raw = urlInput.value.trim();
  if (!raw) { setStatus(t("ui_empty"), "err"); return; }
  goBtn.disabled = true;
  setStatus(t("ui_searching"));
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.runtime.sendMessage({ type: "RESOLVE_DOWNLOAD", url: raw, tabId: tab && tab.id });
    showResult(res);
  } catch (e) {
    setStatus(t("ui_err") + e.message, "err");
  } finally {
    goBtn.disabled = false;
  }
  refreshStatus();
});

$("stop").addEventListener("click", async () => {
  setStatus(t("ui_stopping"));
  try {
    const res = await chrome.runtime.sendMessage({ type: "CANCEL" });
    if (res && res.ok) setStatus(t("ui_stopped"), "");
    else setStatus(t("ui_nothing"), "");
  } catch (e) {
    setStatus(t("ui_err") + e.message, "err");
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
initLang();
initAuto();
refreshStatus();
setInterval(refreshStatus, 1500);

/* Версия из манифеста — бампается в одном месте */
async function showFoot() {
  try {
    const st = await chrome.runtime.sendMessage({ type: "GET_STATUS" }).catch(() => null);
    const h = st && st.helper ? " · " + t("ui_helper_on") : "";
    $("foot-ver").textContent = `VideoLoader ${chrome.runtime.getManifest().version}${h}`;
  } catch { /* popup без manifest — оставляем статичный текст */ }
}
showFoot();

/* Донат: открываем в новой вкладке, popup при этом не ломаем */
document.getElementById("donate").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "https://pay.cloudtips.ru/p/ac545b44" }).catch(() => {});
});
