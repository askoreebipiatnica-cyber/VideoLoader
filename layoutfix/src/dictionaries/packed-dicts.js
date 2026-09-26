/**
 * Загрузчик словарей: префиксные деревья хранятся в chrome.storage.local
 * (записываются tools/build-dicts.mjs при сборке). Ленивая загрузка per-language,
 * кэш в памяти. В Node-тестах storage подменяется.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Dicts) return LF.Dicts;

  const Trie = LF.Trie;

  let storage = (() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
    } catch (e) { /* Node */ }
    return null;
  })();

  const cache = new Map(); // lang -> trie|null
  const pending = new Map(); // lang -> Promise

  /** Загружает trie языка; null, если словаря нет. */
  function get(lang) {
    if (cache.has(lang)) return Promise.resolve(cache.get(lang));
    if (pending.has(lang)) return pending.get(lang);
    const p = new Promise((resolve) => {
      if (!storage) return resolve(null);
      storage.get('dict_' + lang, (data) => {
        const lastError = typeof chrome !== 'undefined' ? chrome.runtime && chrome.runtime.lastError : null;
        if (lastError || !data || !data['dict_' + lang]) {
          cache.set(lang, null);
          return resolve(null);
        }
        const trie = Trie.load(data['dict_' + lang]);
        cache.set(lang, trie);
        resolve(trie);
      });
    });
    pending.set(lang, p);
    return p;
  }

  /** Синхронный кэш: trie или null, если не загружен. */
  function peek(lang) {
    return cache.get(lang) || null;
  }

  /** Есть ли словарь (по факту загрузки). */
  function has(lang) {
    return cache.has(lang) && cache.get(lang) !== null;
  }

  /** Инвалидация кэша (после rebuild словарей). */
  function clear() {
    cache.clear();
    pending.clear();
  }

  return LF.defineModule('Dicts', { get, peek, has, clear, _setStorage(s) {
    storage = s;
    cache.clear();
    pending.clear();
  } });
})(typeof self !== 'undefined' ? self : globalThis);
