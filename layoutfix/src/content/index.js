/**
 * Точка входа контент-скрипта: загрузка настроек → инициализация контроллера.
 * Выполняется в document_start во всех фреймах.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (!LF || !LF.Controller) return;

  function boot(settings) {
    try {
      LF.Controller.init(root.location.hostname, settings);
      // Прогрев словарей выбранных раскладок (лениво, в фоне)
      const layouts = (settings && settings.layouts) || ['ru', 'en'];
      for (const l of layouts) LF.Dicts.get(l);
    } catch (e) {
      // Никогда не ломаем страницу пользователя
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage) {
    LF.Settings.load().then(boot);
    LF.Settings.subscribe(boot);
  } else {
    boot(null);
  }
})(typeof self !== 'undefined' ? self : globalThis);
