/**
 * Движок исправления: берёт слово, перебирает пары раскладок, оценивает
 * кандидатов эвристиками и словарями, выбирает лучший с уверенностью.
 * Работает поверх Layouts/Converter/Heuristics/Dicts и не знает о DOM.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Engine) return LF.Engine;

  const Converter = LF.Converter;
  const Heuristics = LF.Heuristics;
  const Layouts = LF.Layouts;

  // Разделители, по которым режутся слова
  const WORD_SPLIT = /([^\p{L}\p{N}'’-]+)/u;

  /**
   * Последнее слово из текста.
   * @param {string} text
   * @returns {{word: string, offset: number, length: number}|null}
   */
  function lastWordOf(text) {
    if (!text) return null;
    const m = /([\p{L}\p{N}'’-]+)\s*$/u.exec(text);
    if (!m) return null;
    return { word: m[1], offset: m.index, length: m[1].length };
  }

  /**
   * Генерирует кандидатов-исправлений для слова.
   * @param {string} word
   * @param {string[]} pairs — пары раскладок, напр. ['ru|en']
   * @param {object} dicts — { lang: trie|null }
   * @returns {Array<{text: string, from: string, to: string, score: number}>}
   */
  function candidates(word, pairs, dicts) {
    const out = [];
    for (const pairId of pairs) {
      const [from, to] = pairId.split('|');
      const fixed = Converter.convertExact(word, from, to);
      if (fixed === null || fixed === word) continue;
      const trie = dicts ? dicts[to] : null;
      const s = Heuristics.score(fixed, to, trie);
      out.push({ text: fixed, from, to, score: s });
    }
    return out;
  }

  /**
   * Полный анализ слова: нужен ли фикс и какой.
   * @param {string} word
   * @param {object} opts { pairs, dicts, threshold }
   * @returns {{fix: string|null, confidence: number, from: string, to: string}}
   */
  function analyze(word, opts) {
    const pairs = opts.pairs || [];
    const dicts = opts.dicts || {};
    const threshold = opts.threshold != null ? opts.threshold : 90;

    const list = candidates(word, pairs, dicts);
    if (!list.length) return { fix: null, confidence: 0, from: null, to: null };

    list.sort((a, b) => b.score - a.score);
    const best = list[0];
    const second = list[1];
    const confidence = best.score;
    const margin = second ? best.score - second.score : 100;

    if (confidence >= threshold && margin >= 10) {
      return { fix: best.text, confidence, from: best.from, to: best.to };
    }
    return { fix: null, confidence, from: best.from, to: best.to };
  }

  /**
   * Решение по CapsLock-регистру: исправлять ли "пРИВЕТ" -> "Привет".
   */
  function capsFix(word, opts) {
    if (!opts.fixCaps) return null;
    if (!Heuristics.looksLikeCapsLock(word)) return null;
    const script = Heuristics.scriptOf(word);
    if (script === 'cyr' && opts.dicts && opts.dicts.ru && LF.Trie.has(opts.dicts.ru, word.toLowerCase())) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    // Латиница/прочее: только если слово в словаре целиком в нижнем регистре
    for (const lang of Object.keys(opts.dicts || {})) {
      const trie = opts.dicts[lang];
      if (trie && Heuristics.scriptOf(lang) === 'lat') {
        if (LF.Trie.has(trie, word.toLowerCase())) {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          }
      }
    }
    return null;
  }

  return LF.defineModule('Engine', {
    lastWordOf,
    candidates,
    analyze,
    capsFix,
    WORD_SPLIT
  });
})(typeof self !== 'undefined' ? self : globalThis);
