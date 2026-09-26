/**
 * Утилиты редактируемых целей: определение типа, чтение значения,
 * границы слова вокруг каретки.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Editable) return LF.Editable;

  const LF_W = /[\p{L}\p{N}'’-]/u;

  /** Редактируемый элемент? (без проверки приватности — это делает Guard) */
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text', 'search', 'url', 'tel', 'email', 'number'].includes(type);
    }
    if (el.isContentEditable) return true;
    return false;
  }

  /** Читает текст цели. */
  function getValue(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value;
    return el.textContent || '';
  }

  /**
   * Границы слова слева от каретки (input/textarea).
   * @returns {{start:number, end:number, word:string}|null}
   */
  function wordAtCaret(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const pos = el.selectionStart;
      const left = String(el.value).slice(0, pos);
      const m = /([\p{L}\p{N}'’-]+)\s*$/u.exec(left);
      if (!m) return null;
      return { start: m.index, end: pos, word: m[1] };
    }
    return null;
  }

  return LF.defineModule('Editable', { isEditable, getValue, wordAtCaret });
})(typeof self !== 'undefined' ? self : globalThis);
