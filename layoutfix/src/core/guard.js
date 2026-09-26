/**
 * Privacy Guard — безусловное отключение расширения в конфиденциальных полях.
 * Правила применяются до любой обработки ввода: если guard говорит "стоп",
 * никакой символ не читается и не буферизуется.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Guard) return LF.Guard;

  // Приватные значения autocomplete (подстроки): пароли, карты, OTP.
  const PRIVATE_AUTOCOMPLETE = [
    'password', 'cc-number', 'cc-csc', 'cc-exp', 'cc-cvc', 'cvc', 'pin',
    'one-time-code', 'otp', 'new-password'
  ];

  // Атрибуты-метки приватности
  const PRIVATE_ATTRS = ['data-private', 'data-hidden', 'data-nofix'];

  /** Приватное поле? (пароли, скрытые, OTP, карты). */
  function isPrivateField(el) {
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName;

    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'password' || type === 'hidden') return true;
      const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
      for (const frag of PRIVATE_AUTOCOMPLETE) {
        if (ac.indexOf(frag) !== -1) return true;
      }
      // Метки менеджеров паролей: обычно указывают на чувствительное поле
      if (el.hasAttribute('data-lpignore') || el.hasAttribute('data-1p-ignore')) return true;
    }

    for (const attr of PRIVATE_ATTRS) {
      if (el.hasAttribute(attr)) return true;
    }
    if (el.getAttribute('aria-hidden') === 'true') return true;
    if (el.getAttribute('role') === 'password') return true;

    return false;
  }

  /** Приватное поле среди предков (в пределах одного дерева DOM/shadow). */
  function isInsidePrivate(el) {
    let cur = el && el.parentElement ? el.parentElement : null;
    let depth = 0;
    while (cur && depth < 20) {
      if (cur.nodeType === 1 && isPrivateField(cur)) return true;
      if (cur.host) break; // граница shadow DOM
      cur = cur.parentElement || null;
      depth++;
    }
    return false;
  }

  /**
   * Домен в чёрном списке? Точные домены и маски "*.example.com".
   * @param {string} hostname
   * @param {string[]} blacklist
   */
  function isBlacklisted(hostname, blacklist) {
    if (!hostname || !blacklist || !blacklist.length) return false;
    const host = String(hostname).toLowerCase();
    for (const raw of blacklist) {
      const pattern = String(raw).trim().toLowerCase();
      if (!pattern) continue;
      if (pattern.startsWith('*.')) {
        const bare = pattern.slice(2);
        const suffix = pattern.slice(1); // ".example.com"
        if (host === bare || host.endsWith(suffix)) return true;
      } else if (host === pattern || host.endsWith('.' + pattern)) {
        return true;
      }
    }
    return false;
  }

  /** Код-редакторы и код-блоки: <pre>, <code>, Monaco, Ace, CodeMirror и т.п. */
  function isCodeContext(el) {
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 30) {
      const tag = cur.tagName;
      if (tag === 'PRE' || tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') return true;
      const cls = cur.classList;
      if (cls && (
        cls.contains('monaco-editor') ||
        cls.contains('ace_editor') ||
        cls.contains('CodeMirror') ||
        cls.contains('cm-editor') ||
        cls.contains('ProseMirror-code')
      )) return true;
      cur = cur.parentElement || null;
      depth++;
    }
    return false;
  }

  /**
   * Полное решение guard-а: можно ли обрабатывать ввод в элементе.
   * @returns {{allow: boolean, reason: string|null}}
   */
  function decide(el, hostname, blacklist) {
    if (!el || el.nodeType !== 1) return { allow: false, reason: 'no-target' };
    if (isPrivateField(el)) return { allow: false, reason: 'private-field' };
    if (isInsidePrivate(el)) return { allow: false, reason: 'private-ancestor' };
    if (isCodeContext(el)) return { allow: false, reason: 'code-context' };
    if (hostname && isBlacklisted(hostname, blacklist || [])) return { allow: false, reason: 'blacklist' };
    return { allow: true, reason: null };
  }

  return LF.defineModule('Guard', {
    isPrivateField,
    isInsidePrivate,
    isBlacklisted,
    isCodeContext,
    decide,
    PRIVATE_AUTOCOMPLETE,
    PRIVATE_ATTRS
  });
})(typeof self !== 'undefined' ? self : globalThis);
