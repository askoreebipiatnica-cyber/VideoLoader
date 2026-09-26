# LayoutFix — переключатель раскладки текста в браузере

Кроссбраузерное расширение (Manifest V3), которое исправляет текст, набранный
не в той раскладке: `ghbdtn` → `привет`, `руддщ` → `hello`, `пРИВЕТ` → `Привет`.
Аналог Punto Switcher, но целиком внутри браузера.

**12 раскладок**: en (QWERTY), ru, ukr, by (ЙЦУКЕН), de (QWERTZ), fr (AZERTY),
es, it, pl, tr (Türkçe Q), he, ar.

## 🔒 Приватность — главный приоритет

- **0 внешних сетевых запросов.** В CSP прописано `connect-src 'none'` — браузер
  физически блокирует любые соединения из контекстов расширения. В коде нет
  `fetch`, `XMLHttpRequest`, `WebSocket` и `sendBeacon`.
- **Минимальные права**: только `storage` (сохранить настройки). Нет `tabs`,
  нет `history`, нет `<all_urls>`-доступа к данным.
- **Аппаратная дискретизация приватности**: расширение безусловно отключено в
  `input[type=password]`, `input[type=hidden]`, полях с `autocomplete`:
  `password / cc-number / cc-csc / cc-exp / cvc / pin / one-time-code`,
  полях с `data-private`, `data-hidden`, `aria-hidden="true"` и на доменах
  из пользовательского чёрного списка (банкинг, крипта — по умолчанию там уже
  есть пара примеров).
- **Никакого кейлоггера**: нажатия не пишутся на диск. Только кольцевой буфер
  на 64 символа в оперативной памяти, обнуляется при смене поля и по blur.
  Полный разбор — [PRIVACY.md](PRIVACY.md).

## Что умеет

- **Автоисправление** при вводе пробела, Enter или знака препинания — если
  уверенность ≥ 90 % (порог настраивается). Уверенность считается по словарю
  (префиксное дерево), невозможным биграммам языка и балансу гласных/согласных.
- **Ручная конвертация** по горячей клавише `Alt+Shift+X` (переназначается в
  `chrome://extensions/shortcuts`): последнее слово или выделенный фрагмент.
- **CapsLock-фикс**: `пРИВЕТ` → `Привет`.
- **Честная замена текста**: для `<input>`/`<textarea>` — с восстановлением
  каретки и нативными событиями (React/Vue/Angular всё видят); для
  `contenteditable` (Telegram Web, Gmail, Notion) — через `Selection`/`Range` +
  `execCommand('insertText')` с рабочим Ctrl+Z.
- **Исключение кода**: `<pre>`, `<code>`, Monaco, Ace, CodeMirror не трогаются.

## Установка (Chrome/Edge/Brave/Opera/Яндекс/Vivaldi)

1. Склонировать репозиторий или скачать ZIP из Releases.
2. `chrome://extensions/` → включить **Режим разработчика**.
3. **Загрузить распакованное расширение** → выбрать папку `layoutfix/`.
4. Закрепить иконку. Готово.

### Firefox

Готовые ZIP лежат в `dist/` после сборки:

```bash
npm run build   # тесты + синтаксис + валидация манифеста + сборка dist/
```

Получаются два архива:

- `dist/layoutfix-chrome-v<версия>.zip` — для Chrome Web Store;
- `dist/layoutfix-firefox-v<версия>.zip` — для Firefox (AMO): манифест автоматически
  получает `browser_specific_settings`, `background.scripts` (event page вместо
  service worker) и обязательный с 2026 года ключ `data_collection_permissions`.

Firefox: `about:debugging#/runtime/this-firefox` → **Загрузить временное
дополнение** → выбрать `layoutfix-firefox-*.zip` (постоянная установка — через AMO).

## Для разработчиков

```bash
node test/run.mjs          # 45 юнит-тестов ядра (конвертер, эвристики, guard...)
node tools/check-syntax.mjs  # node --check всех js/mjs
node tools/build-dicts.mjs   # сборка trie-словарей (build/dicts.json)
node tools/make-icons.mjs    # перегенерация PNG-иконок (без зависимостей)
```

Зависимостей нет: чистый JavaScript (ES2018+), ядро работает и в браузере,
и в Node (тесты через `node:vm`).

### Структура

```
layoutfix/
├── manifest.json          # MV3: permissions: ["storage"], CSP connect-src 'none'
├── _locales/ru|en/        # i18n
├── icons/                 # 16/32/48/128 (генерируются)
├── src/
│   ├── core/              # ядро без DOM: layouts, converter, trie, heuristics,
│   │                      # ringbuffer, guard, engine, settings
│   ├── content/           # editable, replace, controller, index (document_start)
│   ├── background/        # service worker: бейдж, хоткей, settings-шлюз
│   ├── dictionaries/      # сид-словари + загрузчик trie из chrome.storage
│   └── ui/                # popup + options (vanilla, без фреймворков)
├── test/run.mjs           # юнит-тесты
└── tools/                 # сборка словарей, иконки, упаковка Chrome/Firefox, валидация манифеста, синтаксис
```

Подробная архитектура — [ARCHITECTURE.md](ARCHITECTURE.md).

## Ограничения

- Автоисправление опирается на словарь и биграммы: редкие слова/имена может
  не распознать (ручной хоткей всегда работает).
- Словари — сид-минимум (~250 слов на язык). Полные списки (до 30k слов)
  подключаются через `tools/build-dicts.mjs` + `wordlists/<lang>.txt`.
- Google Docs рендерит текст в canvas — там расширения ввода в принципе бессильны.

## Лицензия

MIT — см. [LICENSE](LICENSE).
