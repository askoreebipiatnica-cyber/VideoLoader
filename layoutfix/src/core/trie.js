/**
 * Сжатое префиксное дерево (Trie) для словарей.
 * Представление "first-child / next-sibling": 4 плоских массива одинаковой длины.
 *   chars[i] — codePoint символа узла i,
 *   child[i] — индекс первого ребёнка или -1,
 *   next[i]  — индекс следующего сиблинга или -1,
 *   word[i]  — 1, если узел завершает слово.
 * Узлы отсортированы так, что дети узла всегда идут после него — поиск по
 * сиблингам короткий (алфавит узла мал), память компактна, загрузка мгновенна.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Trie) return LF.Trie;

  /**
   * Строит trie из списка слов.
   * @param {Iterable<string>} words
   * @returns {{chars:number[], child:number[], next:number[], word:number[], size:number}}
   */
  function build(words) {
    const chars = [0];
    const child = [-1];
    const next = [-1];
    const word = [0];

    for (const raw of words) {
      if (!raw) continue;
      const w = String(raw).toLowerCase();
      let node = 0; // корень
      for (let i = 0; i < w.length; i++) {
        const code = w.charCodeAt(i);
        // ищем ребёнка с таким символом среди сиблингов
        let c = child[node];
        let found = -1;
        while (c !== -1) {
          if (chars[c] === code) { found = c; break; }
          c = next[c];
        }
        if (found === -1) {
          // новый узел
          found = chars.length;
          chars.push(code);
          child.push(-1);
          next.push(child[node]);
          word.push(0);
          child[node] = found;
        }
        node = found;
      }
      word[node] = 1;
    }
    return { chars, child, next, word, size: chars.length };
  }

  /** Загружает trie из сериализованного вида (объект или [chars, child, next, word]). */
  function load(data) {
    if (Array.isArray(data)) return { chars: data[0], child: data[1], next: data[2], word: data[3], size: data[0].length };
    return { chars: data.chars, child: data.child, next: data.next, word: data.word, size: data.size };
  }

  function serialize(trie) {
    return [trie.chars, trie.child, trie.next, trie.word];
  }

  /** Спускается по строке, возвращает индекс узла или -1. */
  function walk(trie, text) {
    let node = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      let c = trie.child[node];
      let found = -1;
      while (c !== -1) {
        if (trie.chars[c] === code) { found = c; break; }
        c = trie.next[c];
      }
      if (found === -1) return -1;
      node = found;
    }
    return node;
  }

  /** Проверка наличия слова (регистр приводится к нижнему). */
  function has(trie, word) {
    if (!word) return false;
    const node = walk(trie, word.toLowerCase());
    return node !== -1 && trie.word[node] === 1;
  }

  /** Есть ли в trie слова с таким префиксом. */
  function hasPrefix(trie, prefix) {
    if (!prefix) return true;
    return walk(trie, prefix.toLowerCase()) !== -1;
  }

  /** Количество слов в trie. */
  function wordCount(trie) {
    let n = 0;
    for (let i = 1; i < trie.word.length; i++) n += trie.word[i];
    return n;
  }

  return LF.defineModule('Trie', { build, load, serialize, has, hasPrefix, wordCount });
})(typeof self !== 'undefined' ? self : globalThis);
