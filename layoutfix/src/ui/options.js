/**
 * Логика страницы настроек: чтение/сохранение всех параметров.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    enabled: $('enabled'),
    autoFix: $('autoFix'),
    threshold: $('threshold'),
    fixCaps: $('fixCaps'),
    detectLang: $('detectLang'),
    layouts: $('layouts'),
    blacklist: $('blacklist'),
    save: $('save'),
    reset: $('reset'),
    saved: $('saved')
  };

  const LAYOUTS = [
    ['ru', 'Русская (ЙЦУКЕН)'],
    ['en', 'English (QWERTY)'],
    ['ukr', 'Українська'],
    ['by', 'Беларуская'],
    ['de', 'Deutsch (QWERTZ)'],
    ['fr', 'Français (AZERTY)'],
    ['es', 'Español'],
    ['it', 'Italiano'],
    ['pl', 'Polski'],
    ['tr', 'Türkçe'],
    ['he', 'עברית'],
    ['ar', 'العربية']
  ];

  for (const [id, label] of LAYOUTS) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    els.layouts.appendChild(opt);
  }

  function load() {
    chrome.storage.local.get('settings', (data) => {
      const s = data.settings || {};
      els.enabled.checked = s.enabled !== false;
      els.autoFix.checked = s.autoFix !== false;
      els.threshold.value = s.confidenceThreshold != null ? s.confidenceThreshold : 90;
      els.fixCaps.checked = s.fixCaps !== false;
      els.detectLang.checked = s.detectLang !== false;
      const sel = Array.isArray(s.layouts) && s.layouts.length ? s.layouts : ['ru', 'en'];
      for (const opt of els.layouts.options) opt.selected = sel.includes(opt.value);
      els.blacklist.value = Array.isArray(s.blacklist) ? s.blacklist.join('\n') : '';
    });
  }

  function collect() {
    const layouts = [...els.layouts.selectedOptions].map((o) => o.value);
    if (!layouts.length) layouts.push('ru', 'en');
    const blacklist = els.blacklist.value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      enabled: els.enabled.checked,
      autoFix: els.autoFix.checked,
      confidenceThreshold: clamp(parseInt(els.threshold.value, 10) || 90, 50, 100),
      fixCaps: els.fixCaps.checked,
      detectLang: els.detectLang.checked,
      layouts,
      blacklist
    };
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function save() {
    chrome.storage.local.get('settings', (data) => {
      const s = Object.assign({}, data.settings, collect());
      chrome.storage.local.set({ settings: s }, () => {
        els.saved.classList.add('show');
        setTimeout(() => els.saved.classList.remove('show'), 1500);
      });
    });
  }

  els.save.addEventListener('click', save);
  els.reset.addEventListener('click', () => {
    chrome.storage.local.remove('settings', load);
  });

  load();
})();
