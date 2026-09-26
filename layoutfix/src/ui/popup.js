/**
 * Логика popup: читаю/пишу настройки через chrome.storage.local.
 */
(function () {
  'use strict';

  const KEYS = ['enabled', 'autoFix', 'fixCaps'];
  const els = {};
  for (const k of KEYS) els[k] = document.getElementById(k);

  const openBtn = document.getElementById('openOptions');

  function load() {
    chrome.storage.local.get('settings', (data) => {
      const s = data.settings || {};
      for (const k of KEYS) {
        if (k in s) els[k].checked = !!s[k];
      }
    });
  }

  function save() {
    chrome.storage.local.get('settings', (data) => {
      const s = data.settings || {};
      for (const k of KEYS) s[k] = els[k].checked;
      chrome.storage.local.set({ settings: s });
    });
  }

  for (const k of KEYS) els[k].addEventListener('change', save);
  openBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  load();
})();
