/**
 * LayoutFix core namespace.
 * Единственная точка глобальной регистрации: все модули ядра экспортируются
 * через LayoutFix.*, чтобы работать в window / worker / Node без бандлера.
 */
(function (root, factory) {
  'use strict';
  const api = (root.LayoutFix = root.LayoutFix || {});
  api.NS_VERSION = '1.0.0';
  factory(api);
})(typeof self !== 'undefined' ? self : globalThis, function (api) {
  'use strict';

  /**
   * Определяет модуль в неймспейсе и защищает от двойной регистрации.
   * @param {string} name
   * @param {object} moduleApi
   */
  api.defineModule = function (name, moduleApi) {
    if (api[name]) return api[name];
    api[name] = moduleApi;
    return moduleApi;
  };
});
