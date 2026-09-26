/**
 * Конвертер: перекладка последовательности символов между раскладками.
 * Работает в обе стороны через реверс-индекс "символ -> клавиша".
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Converter) return LF.Converter;

  const Layouts = LF.Layouts;

  /** Реверс-индекс раскладки: символ -> метка клавиши. */
  const reverseCache = new Map();
  function reverse(layoutId) {
    let rev = reverseCache.get(layoutId);
    if (rev) return rev;
    rev = new Map();
    const parsed = Layouts._parsed && Layouts._parsed.get(layoutId);
    if (parsed) {
      for (const [key, pair] of parsed) {
        if (!rev.has(pair.lower)) rev.set(pair.lower, key);
        if (!rev.has(pair.upper)) rev.set(pair.upper, key);
      }
    }
    reverseCache.set(layoutId, rev);
    return rev;
  }

  /**
   * Перекладывает строку из раскладки from в раскладку to.
   * @param {string} text
   * @param {string} from id раскладки-источника ('ru')
   * @param {string} to id целевой раскладки ('en')
   * @returns {string}
   */
  function convert(text, from, to) {
    if (!text || from === to) return text;
    const src = reverse(from);
    const dst = Layouts._parsed.get(to);
    if (!src || !dst) return text;

    let out = '';
    for (const ch of text) {
      const key = src.get(ch);
      if (!key) {
        out += ch; // символ не из исходной раскладки — оставляем как есть
        continue;
      }
      const pair = dst.get(key);
      if (!pair) {
        out += ch;
        continue;
      }
      // Регистр: в исходной раскладке символ — это lower или upper пара
      const srcParsed = Layouts._parsed.get(from);
      const srcPair = srcParsed.get(key);
      const isUpper = srcPair && ch === srcPair.upper && srcPair.upper !== srcPair.lower;
      out += isUpper ? pair.upper : pair.lower;
    }
    return out;
  }

  /**
   * Точный вариант: перекладка с учётом регистра через общий скелет клавиш.
   * Возвращает null, если хотя бы один символ не транслитерируется.
   */
  function convertExact(text, from, to) {
    if (!text || from === to) return text;
    const src = reverse(from);
    const dst = Layouts._parsed.get(to);
    const srcParsed = Layouts._parsed.get(from);
    if (!src || !dst || !srcParsed) return null;
    let out = '';
    for (const ch of text) {
      const key = src.get(ch);
      if (!key) return null;
      const pair = dst.get(key);
      if (!pair) return null;
      const srcPair = srcParsed.get(key);
      const isUpper = srcPair && ch === srcPair.upper && srcPair.upper !== srcPair.lower;
      out += isUpper ? pair.upper : pair.lower;
    }
    return out;
  }

  /**
   * Определяет, какой раскладке принадлежит строка (по плотности символов).
   * Возвращает id раскладки или null.
   */
  function detectLayout(text) {
    if (!text) return null;
    const scores = new Map();
    for (const id of Layouts.ids()) {
      const rev = reverse(id);
      let hits = 0;
      let total = 0;
      for (const ch of text) {
        if (!/[\p{L}\p{N}]/u.test(ch)) continue;
        total++;
        if (rev.has(ch)) hits++;
      }
      if (total > 0) scores.set(id, hits / total);
    }
    let best = null;
    let bestScore = 0;
    for (const [id, score] of scores) {
      if (score > bestScore) {
        best = id;
        bestScore = score;
      }
    }
    return bestScore >= 0.99 ? best : null;
  }

  return LF.defineModule('Converter', { convert, convertExact, detectLayout, _reverse: reverse });
})(typeof self !== 'undefined' ? self : globalThis);
