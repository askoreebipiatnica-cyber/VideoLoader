/**
 * Замена текста:
 *  - input/textarea: точечная замена фрагмента + нативные input/change
 *    (со setting`ом value через дескриптор — совместимо с React/Vue/Angular);
 *  - contenteditable: window.getSelection + Range + execCommand('insertText')
 *    для сохранения undo-истории (Ctrl+Z / Cmd+Z).
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Replace) return LF.Replace;

  const doc = root.document || (typeof document !== 'undefined' ? document : null);

  /** Родной setter value (обходит перехватчики React и др.). */
  const valueSetter = (() => {
    if (!doc) return null;
    const proto = Object.getPrototypeOf(doc.createElement('input'));
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    return d && d.set ? d.set : null;
  })();

  /**
   * Заменяет фрагмент [start, end) в input/textarea, восстанавливает каретку
   * и рассылает нативные события.
   */
  function replaceInField(el, start, end, text) {
    const value = el.value;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const next = before + text + after;

    if (valueSetter && el instanceof HTMLInputElement) {
      valueSetter.call(el, next);
    } else {
      el.value = next;
    }

    const caret = start + text.length;
    try { el.setSelectionRange(caret, caret); } catch (e) { /* type не поддерживает */ }

    fireInput(el, next);
  }

  /** Нативные события input (+ change при blur-совместимости). */
  function fireInput(el, value) {
    let ev;
    try {
      ev = new InputEvent('input', { bubbles: true, composed: true, data: null, inputType: 'insertText' });
    } catch (e) {
      ev = doc.createEvent('Event');
      ev.initEvent('input', true, true);
    }
    el.dispatchEvent(ev);

    // React 16+: трекер значения, чтобы onChange сработал
    const tracker = el._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') {
      tracker.setValue('');
    }
  }

  /**
   * Замена выделенного фрагмента в contenteditable с undo.
   * Работает через execCommand('insertText') — сохраняет историю Ctrl+Z.
   * @returns {boolean} успех
   */
  function replaceInContentEditable(replacement) {
    const sel = root.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return false;
    sel.deleteFromDocument();
    return doc.execCommand('insertText', false, replacement);
  }

  /**
   * Замена последнего слова перед кареткой в contenteditable с undo.
   * @param {Element} editable — contenteditable-элемент
   * @param {string} replacement
   */
  function replaceLastWordCE(editable, replacement) {
    const sel = root.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);

    // Ищем текстовый узел и смещение слева от каретки
    const node = range.startContainer;
    if (node.nodeType !== 3) return false; // только текстовый узел
    const text = node.textContent.slice(0, range.startOffset);
    const m = /([\p{L}\p{N}'’-]+)$/u.exec(text);
    if (!m) return false;
    const wordLen = m[1].length;

    const wordRange = doc.createRange();
    wordRange.setStart(node, range.startOffset - wordLen);
    wordRange.setEnd(node, range.startOffset);
    sel.removeAllRanges();
    sel.addRange(wordRange);
    sel.deleteFromDocument();
    return doc.execCommand('insertText', false, replacement);
  }

  return LF.defineModule('Replace', {
    replaceInField,
    replaceInContentEditable,
    replaceLastWordCE,
    fireInput
  });
})(typeof self !== 'undefined' ? self : globalThis);
