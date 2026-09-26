/**
 * Эвристики языка: определение скрипта, невозможных N-грамм, оценка
 * "правдоподобности" слова и исправление регистра (случайный CapsLock).
 * Всё локально, на компактных таблицах.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Heuristics) return LF.Heuristics;

  const Trie = LF.Trie;

  /**
   * Невозможные биграммы для языков на кириллице и латинице.
   * Ключ — язык, значение — строки биграмм (регистр не важен).
   * Проверяются только буквенные пары (без разделителей).
   */
  // prettier-ignore
  const IMPOSSIBLE_BIGRAMS = {
    ru: [
      'аь', 'бй', 'вь', 'гй', 'гь', 'дй', 'жй', 'жь', 'зй', 'йй',
      'кй', 'кь', 'лй', 'мй', 'нй', 'оь', 'пй', 'пь', 'рй', 'сй',
      'сць', 'тй', 'фь', 'хй', 'цй', 'ць', 'чй', 'чь', 'шй', 'шь',
      'щй', 'щь', 'ыы', 'ьь', 'эь', 'юь', 'яь', 'ъъ', 'ыь', 'йь'
    ],
    ukr: [
      'аь', 'бй', 'вь', 'гй', 'ґь', 'дй', 'жй', 'жь', 'зй', 'йй',
      'кй', 'кь', 'лй', 'мй', 'нй', 'оь', 'пй', 'пь', 'рй', 'сй',
      'тй', 'фь', 'хй', 'цй', 'ць', 'чй', 'чь', 'шй', 'шь',
      'щй', 'щь', 'ы', 'э', 'ыы', 'ьь', 'йь', 'ъ'
    ],
    by: [
      'аь', 'бй', 'вь', 'гй', 'дй', 'жй', 'жь', 'зй', 'йй', 'кй',
      'кь', 'лй', 'мй', 'нй', 'оь', 'пй', 'пь', 'рй', 'сй', 'тй',
      'фь', 'хй', 'цй', 'ць', 'чй', 'чь', 'шй', 'шь', 'щй', 'щь',
      'ы', 'э', 'ыы', 'ьь', 'йь', 'ъ'
    ],
    en: [
      'qk', 'qx', 'vq', 'wq', 'xg', 'xj', 'xk', 'xv', 'xz', 'jq',
      'qj', 'jv', 'kq', 'vz', 'zx', 'mx', 'hx', 'fx', 'bx'
    ],
    de: [
      'äq', 'öq', 'üq', 'äh', 'öh', 'üh', 'ij', 'jj', 'qj', 'qx',
      'vq', 'wq', 'xg', 'xj', 'xk', 'xv', 'xz'
    ],
    fr: [
      'qk', 'qx', 'vq', 'wq', 'xg', 'xj', 'xk', 'xv', 'xz', 'jq',
      'qj', 'kq', 'vz', 'zx', 'mx', 'hx', 'fx', 'bx', 'wk', 'wz'
    ],
    es: [
      'qk', 'qx', 'vq', 'wq', 'xg', 'xj', 'xk', 'xv', 'xz', 'jq',
      'qj', 'kq', 'vz', 'zx', 'mx', 'hx', 'fx', 'bx', 'wk', 'wz'
    ],
    it: [
      'qk', 'qx', 'vq', 'wq', 'xg', 'xj', 'xk', 'xv', 'xz', 'jq',
      'qj', 'kq', 'vz', 'zx', 'mx', 'hx', 'fx', 'bx', 'wk', 'wz'
    ],
    pl: [
      'ąq', 'ęq', 'óq', 'qx', 'vq', 'wq', 'xg', 'xj', 'xk', 'xv',
      'xz', 'jq', 'qj', 'kq', 'vz', 'zx'
    ],
    tr: [
      'q', 'w', 'x', 'şk', 'ğk', 'çk', 'ğğ', 'şş', 'çç', 'îî'
    ],
    he: [
      'אא', 'הה', 'חח', 'טט', 'ככ', 'םם', 'סס', 'ץ', 'ףף', 'קק',
      'רר', 'שש', 'תת'
    ],
    ar: []
  };

  // Прекомпилированные Set-ы
  const bigramSets = new Map();
  for (const lang of Object.keys(IMPOSSIBLE_BIGRAMS)) {
    bigramSets.set(lang, new Set(IMPOSSIBLE_BIGRAMS[lang]));
  }

  /** Скрипт слова: 'cyr' | 'lat' | 'heb' | 'ara' | 'other'. */
  function scriptOf(word) {
    let cyr = 0, lat = 0, heb = 0, ara = 0, other = 0;
    for (const ch of word.toLowerCase()) {
      if (!/\p{L}/u.test(ch)) continue;
      if (/[\u0400-\u04FF]/.test(ch)) cyr++;
      else if (/[a-z]/.test(ch)) lat++;
      else if (/[\u0590-\u05FF]/.test(ch)) heb++;
      else if (/[\u0600-\u06FF]/.test(ch)) ara++;
      else other++;
    }
    const max = Math.max(cyr, lat, heb, ara, other);
    if (max === 0) return 'other';
    if (max === cyr) return 'cyr';
    if (max === lat) return 'lat';
    if (max === heb) return 'heb';
    if (max === ara) return 'ara';
    return 'other';
  }

  /** Доля букв, не встречающихся в языке (быстрый отсев). */
  function foreignCharScore(word, layoutId, Layouts) {
    const chars = new Set(Layouts.chars(layoutId));
    let foreign = 0;
    let total = 0;
    for (const ch of word.toLowerCase()) {
      if (!/\p{L}/u.test(ch)) continue;
      total++;
      if (!chars.has(ch)) foreign++;
    }
    return total ? foreign / total : 0;
  }

  /**
   * Считает число невозможных биграмм в слове для языка.
   */
  function impossibleBigrams(word, lang) {
    const set = bigramSets.get(lang);
    if (!set) return 0;
    const w = word.toLowerCase();
    let count = 0;
    for (let i = 0; i < w.length - 1; i++) {
      if (set.has(w.slice(i, i + 2))) count++;
    }
    return count;
  }

  /**
   * Оценка принадлежности слова языку (0..100).
   * @param {string} word — слово после перекладки
   * @param {string} lang — id языка ('ru', 'en', ...)
   * @param {object|null} trie — словарь языка (может отсутствовать)
   */
  function score(word, lang, trie) {
    if (!word) return 0;
    const w = word.toLowerCase();
    const letters = w.replace(/[^\p{L}]/gu, '');
    if (!letters) return 0;

    let s = 30; // база: слово из букв

    // 1. Словарь — главный сигнал
    if (trie) {
      if (Trie.has(trie, w)) s += 65;
      else if (Trie.hasPrefix(trie, w)) s += 15;
      else s -= 10;
    }

    // 2. Невозможные биграммы — жёсткий штраф
    const bad = impossibleBigrams(w, lang);
    if (bad > 0) s -= 30 * bad;

    // 3. Длина: короткие слова склонны к ложным срабатываниям
    if (letters.length === 1) s -= 15;
    else if (letters.length === 2) s -= 5;

    // 4. Разумный баланс гласных/согласных
    const vowels = (letters.match(/[aeiouyаеёиоуыэюяіїєґαεηιουω]/g) || []).length;
    const consonants = letters.length - vowels;
    if (consonants > vowels * 4 && letters.length > 3) s -= 12;

    return Math.max(0, Math.min(100, s));
  }

  /**
   * Исправляет регистр при случайном CapsLock:
   * "пРИВЕТ" -> "Привет", "пРИВЕТ мИР" -> "Привет мир" (первая заглавная).
   * @param {string} word
   * @param {boolean} sentenceCase — делать первую букву заглавной
   */
  function fixCapsCase(word, sentenceCase) {
    if (!word) return word;
    const hasLower = /[a-zа-яёіїєґё\p{Ll}]/u.test(word);
    const hasUpper = /[A-ZА-ЯЁІЇЄ\p{Lu}]/u.test(word);
    if (hasLower && hasUpper) {
      // Смешанный регистр — признак CapsLock
      return sentenceCase
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : word.toLowerCase();
    }
    if (!hasLower && hasUpper && word.length > 1) {
      // ВЕРХНИЙ регистр целиком — не трогаем (аббревиатуры), кроме CapsLock-режима
      return word;
    }
    return word;
  }

  /**
   * Похоже ли слово на случайный CapsLock (все буквы заглавные, но не аббревиатура).
   */
  function looksLikeCapsLock(word) {
    if (word.length < 3) return false;
    if (!/^\p{Lu}+$/u.test(word)) return false;
    // Эвристика: аббревиатуры обычно <= 5 символов или содержат цифры
    return word.length > 5 || /[0-9]/.test(word);
  }

  return LF.defineModule('Heuristics', {
    scriptOf,
    foreignCharScore,
    impossibleBigrams,
    score,
    fixCapsCase,
    looksLikeCapsLock,
    _bigramSets: bigramSets
  });
})(typeof self !== 'undefined' ? self : globalThis);
