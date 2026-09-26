# Архитектура LayoutFix

## Обзор

Расширение Manifest V3 без сборщиков и зависимостей. Три контекста исполнения:

```
┌────────────────────┐   messages   ┌──────────────────────┐
│ Content scripts    │ ───────────> │ Service worker       │
│ (все фреймы,       │              │ (бейдж, хоткей,      │
│  document_start)   │ <─────────── │  настройки)          │
└─────────┬──────────┘              └──────────┬───────────┘
          │                                    │
   ┌──────▼──────┐                      ┌──────▼──────┐
   │ DOM вкладки │                      │ chrome.storage.local
   └─────────────┘                      │ (настройки, словари)
                                        └─────────────┘
```

Ядро (`src/core/*`) не знает ни о DOM, ни о chrome.* — оно работает в любом
контексте (и в Node для тестов). Контент-скрипты подключают ядро классическими
скриптами в правильном порядке через общий неймспейс `LayoutFix.*`.

## Поток обработки нажатия

1. **keydown (capture)** → `Controller.onKeyDown`.
2. `Guard.decide(target)` — приватное ли поле / код-контекст / домен в чёрном
   списке. При запрете: буфер сбрасывается, ввод не трогается вообще.
3. Обычный символ → `RingBuffer.push` (макс. 64, память, не диск).
4. Разделитель (пробел / Enter / `,.!?;:`) → `Engine.analyze(последнееСлово)`:
   - `Converter.convertExact` для каждой пары раскладок пользователя;
   - `Heuristics.score`: словарь (trie, +65), невозможные биграммы (−30 каждая),
     длина, баланс гласных/согласных;
   - лучший кандидат применяется, если уверенность ≥ порога (по умолчанию 90)
     и отрыв от второго кандидата ≥ 10;
   - иначе — попытка CapsLock-фикса (`Engine.capsFix`).
5. `Replace.replaceInField` (input/textarea: value через родной сеттер +
   `setSelectionRange` + нативный `InputEvent`, совместимо с React) или
   `Replace.replaceLastWordCE` (contenteditable: Range + `execCommand('insertText')`
   с сохранением undo).

## Модули ядра

| Модуль | Ответственность |
|--------|-----------------|
| `namespace.js` | Единая точка регистрации `LayoutFix.*`, `defineModule` |
| `layouts.js` | Таблицы 12 раскладок: `метка клавиши → {lower, upper}` |
| `converter.js` | Реверс-индексы `символ → клавиша`, `convertExact`/`convert`, `detectLayout` |
| `trie.js` | Префиксное дерево first-child/next-sibling: build/load/has/hasPrefix |
| `heuristics.js` | Скрипты, невозможные биграммы, `score`, CapsLock-эвристики |
| `ringbuffer.js` | Кольцевой буфер 64 символа (FIFO, pop, tail, lastWord) |
| `guard.js` | Приватные поля, предки, код-контексты, чёрный список |
| `engine.js` | `lastWordOf`, генерация кандидатов, `analyze`, `capsFix` |
| `settings.js` | Дефолты, load/save через chrome.storage, подписки |

## Словари

- Сид-минимум (`dict-data.js`, ~250 частотных слов на язык) компилируется в
  trie при первом запуске и всегда работает офлайн.
- Полные словари: `tools/build-dicts.mjs` читает `wordlists/<lang>.txt`
  (до 30 000 слов), строит trie и пишет `build/dicts.json` для загрузки в
  `chrome.storage.local`; `Dicts.get(lang)` лениво грузит и кэширует.

## Приватность на уровне архитектуры

- CSP `connect-src 'none'` в манифесте — сеть заблокирована платформой.
- Права: только `storage`. Нет `host_permissions`, нет `tabs`, нет `scripting`.
- Ввод никогда не покидает память вкладки: в service worker уходят только
  `{type:'layoutfix:badge'}` (мигнуть иконкой) и запросы настроек.
- Буфер 64 символа — сознательное ограничение: даже при компрометации памяти
  вкладки leaked максимум — последние полслова.

## Совместимость

- Chrome/Edge/Brave/Opera/Vivaldi/Яндекс: MV3 service worker.
- Firefox ≥ 115: `tools/package-firefox.mjs` добавляет
  `browser_specific_settings` и background-скрипты вместо SW.
- Тяжёлые редакторы: Monaco/Ace/CodeMirror и `<pre>/<code>` исключены guard-ом;
  Google Docs (canvas-рендер) не поддерживается технически.
