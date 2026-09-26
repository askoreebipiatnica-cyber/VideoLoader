/**
 * Service worker (MV3): инициализация настроек и словарей, мигание бейджа
 * при исправлении, горячая клавиша через commands API. Никакой сети.
 */
// Chrome MV3: importScripts; Firefox background-страница грузит те же файлы
// через manifest.background.scripts — importScripts там отсутствует.
if (typeof importScripts === 'function') {
  importScripts(
    '../core/namespace.js',
    '../core/settings.js',
    '../core/layouts.js',
    '../core/converter.js',
    '../core/trie.js',
    '../core/ringbuffer.js',
    '../core/engine.js',
    '../dictionaries/packed-dicts.js',
    '../dictionaries/dict-data.js'
  );
}

const DEFAULTS = LayoutFix.Settings.DEFAULTS;

// ---------- Установка ----------

chrome.runtime.onInstalled.addListener(() => {
  // Задаем дефолтные настройки при установке
  chrome.storage.local.get('settings', (data) => {
    if (!data.settings) {
      chrome.storage.local.set({ settings: DEFAULTS });
    }
  });
});

// ---------- Сообщения от контента ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'layoutfix:badge') {
    flashBadge();
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'layoutfix:getSettings') {
    chrome.storage.local.get('settings', (data) => {
      sendResponse({ settings: data.settings || DEFAULTS });
    });
    return true; // async
  }
});

// ---------- Горячая клавиша ----------

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'convert-last') return;
  // Отправляем команду активной вкладке
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'layoutfix:convert' }, () => {
      void chrome.runtime.lastError; // контент мог не загрузиться — молча
    });
  });
});

// ---------- Бейдж ----------

let badgeTimer = null;
function flashBadge() {
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
  if (badgeTimer) clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
    badgeTimer = null;
  }, 1200);
}
