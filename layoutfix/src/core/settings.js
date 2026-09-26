/**
 * Настройки: значения по умолчанию, чтение/запись через chrome.storage.local
 * с кэшем в памяти и подпиской на изменения. Никогда не содержит секретов.
 * В Node-тестах storage подменяется моком.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Settings) return LF.Settings;

  const DEFAULTS = Object.freeze({
    enabled: true,
    // Автоисправление при вводе разделителя, если уверенность > threshold
    autoFix: true,
    confidenceThreshold: 90, // процент
    fixCaps: true, // "пРИВЕТ" -> "Привет" при случайном CapsLock
    capsSwap: false, // CapsLock = переключение раскладки (крайний случай)
    hotkey: 'Alt+Shift+X', // ручная конвертация
    convertSelection: true, // конвертировать выделение, если оно есть
    layouts: ['ru', 'en'], // основные раскладки пользователя
    detectLang: true, // эвристика языка
    soundFeedback: false, // звуковой сигнал невозможен: никаких внешних ресурсов; только мигание иконки
    blacklist: [
      // Домены, где расширение всегда отключено (банкинг, крипта и т.п.)
      'online.sberbank.ru',
      'ib.bankofgeorgia.ge'
    ],
    excludeCodeEditors: true,
    showBadgeOnFix: true
  });

  let storage = (() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
    } catch (e) { /* Node-тесты */ }
    return null;
  })();

  const listeners = new Set();
  let cache = null;
  let loading = null;

  function clone(src) {
    return JSON.parse(JSON.stringify(src));
  }

  /** Загружает настройки (однократно), далее отдаёт кэш. */
  function load() {
    if (cache) return Promise.resolve(clone(cache));
    if (!loading) {
      loading = new Promise((resolve) => {
        if (!storage) return resolve(clone(DEFAULTS));
        storage.get(null, (data) => {
          const lastError = typeof chrome !== 'undefined' ? chrome.runtime && chrome.runtime.lastError : null;
          if (lastError) return resolve(clone(DEFAULTS));
          resolve(Object.assign(clone(DEFAULTS), data && data.settings ? data.settings : {}));
        });
      }).then((merged) => {
        cache = merged;
        return clone(cache);
      });
    }
    return loading;
  }

  /** Синхронный доступ к кэшу (после load()). Может вернуть null до загрузки. */
  function peek() {
    return cache ? clone(cache) : null;
  }

  /** Сохраняет частичное обновление настроек. */
  function save(patch) {
    return load().then((current) => {
      const next = Object.assign({}, current, patch);
      cache = next;
      if (!storage) return clone(next);
      return new Promise((resolve) => {
        storage.set({ settings: next }, () => resolve(clone(next)));
      });
    });
  }

  /** Подписка на изменения (в т.ч. из options-страницы через storage). */
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function notify(next) {
    cache = next;
    for (const fn of listeners) {
      try { fn(clone(next)); } catch (e) { /* слушатель не должен ломать шину */ }
    }
  }

  if (storage && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) notify(Object.assign(clone(DEFAULTS), changes.settings.newValue || {}));
    });
  }

  function reset() {
    return save(clone(DEFAULTS));
  }

  return LF.defineModule('Settings', {
    DEFAULTS,
    load,
    peek,
    save,
    reset,
    subscribe,
    /** Тестовый хук: подменить storage. */
    _setStorage(s) {
      storage = s;
      cache = null;
      loading = null;
    }
  });
})(typeof self !== 'undefined' ? self : globalThis);
