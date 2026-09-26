/**
 * Контроллер ввода: keydown-обработка, кольцевой буфер, автоисправление при
 * разделителях, горячая клавиша, CapsLock-режим. Единая точка входа контента.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Controller) return LF.Controller;

  const Guard = LF.Guard;
  const Editable = LF.Editable;
  const Replace = LF.Replace;
  const Engine = LF.Engine;
  const RingBuffer = LF.RingBuffer;
  const Dicts = LF.Dicts;
  const Heuristics = LF.Heuristics;
  const Converter = LF.Converter;

  let settings = null;
  let hostname = '';
  let buffer = new RingBuffer(64);
  let currentTarget = null;
  let lastConvertAt = 0;

  /** Словари для выбранных раскладок (только те, что есть в DICT_DATA). */
  function dictsForLayouts() {
    const out = {};
    for (const l of (settings && settings.layouts) || ['ru', 'en']) {
      if (LF.DICT_DATA && LF.DICT_DATA[l]) out[l] = Dicts.peek(l);
    }
    return out;
  }

  // ---------- Настройки ----------

  function init(host, initialSettings) {
    hostname = host || '';
    settings = initialSettings || LF.Settings && LF.Settings.peek() || null;
    bind();
  }

  function applySettings(next) {
    settings = next;
  }

  // ---------- Приватность ----------

  /** Расширение активно для текущей цели? */
  function activeFor(el) {
    if (!settings || settings.enabled === false) return false;
    if (!el || !Editable.isEditable(el)) return false;
    const verdict = Guard.decide(el, hostname, settings.blacklist || []);
    return verdict.allow;
  }

  // ---------- Буфер ----------

  function resetBuffer() {
    buffer.clear();
    currentTarget = null;
  }

  function trackPrintable(e) {
    if (e.key && e.key.length === 1) {
      buffer.push(e.key);
      return true;
    }
    return false;
  }

  // ---------- Автоисправление ----------

  /** Пытается исправить слово слева от каретки. Возвращает true, если исправил. */
  function tryAutoFix(el) {
    if (!activeFor(el)) return false;
    const info = Editable.wordAtCaret(el);
    if (!info || !info.word) return false;

    const word = info.word;
    // Однобуквенные и чисто-цифровые не трогаем
    if (word.length < 2 || /^\d+$/u.test(word)) return false;

    const pairs = buildPairs(settings.layouts || ['ru', 'en']);
    const dicts = dictsForLayouts();

    const verdict = Engine.analyze(word, {
      pairs,
      dicts,
      threshold: settings.confidenceThreshold || 90
    });

    if (!verdict.fix) {
      return tryCapsFix(el, info);
    }

    applyFix(el, info.start, info.end, verdict.fix);
    return true;
  }

  /** Исправление регистра (CapsLock). */
  function tryCapsFix(el, info) {
    const fixed = Engine.capsFix(info.word, {
      fixCaps: settings.fixCaps,
      dicts: dictsForLayouts()
    });
    if (fixed && fixed !== info.word) {
      applyFix(el, info.start, info.end, fixed);
      return true;
    }
    return false;
  }

  /** Применяет исправление к цели. */
  function applyFix(el, start, end, replacement) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      Replace.replaceInField(el, start, end, replacement);
    } else if (el.isContentEditable) {
      Replace.replaceLastWordCE(el, replacement);
    }
    if (settings && settings.showBadgeOnFix) flashBadge();
  }

  function flashBadge() {
    try {
      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'layoutfix:badge' });
      }
    } catch (e) { /* контекст может быть недоступен */ }
  }

  // ---------- Ручная конвертация (горячая клавиша) ----------

  /** Конвертирует последнее слово или выделение (с дедупликацией двойного вызова). */
  function manualConvert() {
    const now = Date.now();
    if (now - lastConvertAt < 150) return; // commands API + keydown могут сработать вместе
    lastConvertAt = now;

    const el = root.document && root.document.activeElement;
    if (!activeFor(el)) return;

    // 1. Выделение
    if (settings.convertSelection !== false) {
      const sel = root.getSelection && root.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        if (el && el.isContentEditable) {
          const text = sel.toString();
          const pairs = buildPairs(settings.layouts || ['ru', 'en']);
          const verdict = Engine.analyze(text, { pairs, dicts: dictsForLayouts(), threshold: 0 });
          if (verdict.fix) {
            Replace.replaceInContentEditable(verdict.fix);
          }
          return;
        }
      }
    }

    // 2. Последнее слово
    const info = Editable.wordAtCaret(el);
    if (!info) return;
    const pairs = buildPairs(settings.layouts || ['ru', 'en']);
    const verdict = Engine.analyze(info.word, { pairs, dicts: dictsForLayouts(), threshold: 0 });
    if (verdict.fix) {
      applyFix(el, info.start, info.end, verdict.fix);
    }
  }

  /** Строит пары раскладок "из|в" из списка основных раскладок. */
  function buildPairs(layouts) {
    const pairs = [];
    for (let i = 0; i < layouts.length; i++) {
      for (let j = 0; j < layouts.length; j++) {
        if (i !== j) pairs.push(layouts[i] + '|' + layouts[j]);
      }
    }
    return pairs;
  }

  // ---------- Слушатели ----------

  function onKeyDown(e) {
    const el = e.target;
    if (!el || !Editable.isEditable(el)) return;

    // Hotkey Alt+Shift+X (или из настроек): ручная конвертация
    if (e.altKey && e.shiftKey && (e.code === 'KeyX')) {
      e.preventDefault();
      manualConvert();
      return;
    }

    if (!activeFor(el)) {
      resetBuffer();
      return;
    }

    // Смена цели — сброс буфера (приватность: ничего не переносится между полями)
    if (currentTarget !== el) {
      resetBuffer();
      currentTarget = el;
    }

    const key = e.key;

    // Backspace: откат буфера
    if (key === 'Backspace') {
      buffer.pop(1);
      return;
    }

    // Разделители: момент автоисправления
    if (key === ' ' || key === 'Enter' || /^[,.;:!?]$/.test(key)) {
      const hadBuffer = buffer.length > 0;
      trackPrintable(e);
      if (hadBuffer && settings.autoFix) {
        // Исправляем слово слева от каретки (разделитель уже в поле)
        tryAutoFix(el);
      }
      return;
    }

    trackPrintable(e);
  }

  function onBlur() {
    resetBuffer();
  }

  function bind() {
    root.document.addEventListener('keydown', onKeyDown, true);
    root.document.addEventListener('blur', onBlur, true);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'layoutfix:convert') manualConvert();
      });
    }
  }

  function unbind() {
    root.document.removeEventListener('keydown', onKeyDown, true);
    root.document.removeEventListener('blur', onBlur, true);
  }

  return LF.defineModule('Controller', { init, applySettings, manualConvert, onKeyDown, _resetBuffer: resetBuffer, _activeFor: activeFor });
})(typeof self !== 'undefined' ? self : globalThis);
