# VideoLoader — расширение для браузера: качай видео одной кнопкой

**🇷🇺 [Русский](#videoloader--расширение-для-браузера-качай-видео-одной-кнопкой) · 🇬🇧 [English](#videoloader--browser-extension-one-click-video-downloader)**

> 🧩 **Это расширение для браузера** (Chrome / Edge / Firefox / Opera / Яндекс / Brave / Vivaldi), а не отдельная программа: ставится за минуту, ничего не пишет в систему.

Бесплатное расширение с открытым кодом. Без регистрации, без водяных знаков. Работает на Windows и macOS.

![Демо: скачивание рилса за 4 шага](docs/demo.gif)

## ❤️ Поддержать
Если расширение экономит время — [поддержи разработку ♥](https://pay.cloudtips.ru/p/ac545b44).

## Что умеет
- 🎯 **Одна строка + «Скачать»** — вставь ссылку на видео, пост, рилс, TikTok, YouTube.
- 🌍 **6 языков**: русский, English, Deutsch, 中文, қазақша, 한국어 — переключатель в окне, по умолчанию язык браузера.
- 🧠 **Сам ищет цельный файл**: помощник → прямой MP4 → данные открытой вкладки → `og:video` → `video_url` → Instagram API → TikTok → embed. Мусор не сохраняет — скажет честно.
- ⚡ **Авто-сохранение** (по умолчанию выкл): смотришь видео — файл сам падает в загрузки. Мелочь и анимации пропускаются.
- 🛑 **Стоп** в любой момент, закрытие окна закачку не прерывает.
- 📜 **Журнал**: последние 7 файлов, «Показать» открывает в папке, ✕ удаляет с диска.
- 🌗 Светлая / тёмная / как в системе, стекло в духе macOS.
- 🖥️ **Локальный помощник** (yt-dlp): Windows — `helper\run-helper.bat`, macOS/Linux — `helper\run-helper.sh` (нужны node и yt-dlp в PATH). Подробности ниже.
- 🧩 **Браузеры**: Chrome, Edge, Brave, Vivaldi, Opera, Яндекс, Firefox (MV3). **ОС**: Windows, macOS, Linux.

## Установка за 1 минуту

**Вариант А — ZIP (проще):**
1. Скачай `videoloader.zip` из раздела [Releases](../../releases) и распакуй.
2. Открой `chrome://extensions/` → включи **«Режим разработчика»**.
3. **«Загрузить распакованное расширение»** → выбери папку `videoloader`.
4. Закрепи иконку на панели. Готово.

**Вариант Б — через командную строку:**
```powershell
git clone https://github.com/askoreebipiatnica-cyber/VideoLoader.git
```
Дальше шаги 2–4 из варианта А с папкой из клона.

Без помощника тоже работает: включи **«Авто-сохранение»**, открой видео, нажми Play — файл сохранится сам.

## Локальный помощник
Сервер на твоей машине (Node + yt-dlp), только `127.0.0.1`. Сначала поставь сам yt-dlp:
- Windows: скачай `yt-dlp.exe` с https://github.com/yt-dlp/yt-dlp/releases в папку расширения (рядом с `manifest.json`), затем запусти `helper/run-helper.bat`.
- macOS/Linux: установи yt-dlp в PATH (`brew install yt-dlp` или через pip), затем `chmod +x helper/run-helper.sh && ./helper/run-helper.sh`.
- Тянет видео через yt-dlp **с куками твоего Chrome** — доступны и приватные посты.
- Не запущен — расширение молча идёт по встроенной цепочке.
- Готовое складывается в `helper/out`, чистка каждые 30 минут (файлы старше часа).

## Установка в Firefox
`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → выбери `manifest.json` из папки. Работает до перезапуска браузера (без подписи Mozilla иначе нельзя).

## Честные ограничения
- Качается только цельный MP4/WEBM. Нет цельного файла — расширение так и скажет, битый файл не подсунет.
- HLS (`.m3u8`) / DASH (`.mpd`) — плейлисты, а не видео.
- YouTube в топ-качестве отдаёт только DASH — забирается то, что отдаётся цельным.
- Сайты меняют разметку — лечится обновлением.

## Для разработчиков
```powershell
node --check background.js popup.js content.js parser.js
node test/run.mjs    # 83 parser unit tests
node test/chain.mjs  # 35 end-to-end chain tests
node test/i18n.mjs   # 23 locale completeness tests
```
Иконки: `scripts/make-icons.ps1`. Демо-гифка: `scripts/make-demo.py`. Версия — в `manifest.json`, в окне отображается сама.

---

# VideoLoader — browser extension: one-click video downloader

> 🧩 **This is a browser extension** (Chrome / Edge / Firefox / Opera / Yandex / Brave / Vivaldi), not a standalone program: installs in a minute, writes nothing to the system.

Free open-source extension. No sign-up, no watermarks. Works on Windows and macOS.

![Demo: downloading a reel in 4 steps](docs/demo.gif)

## ❤️ Support
If the extension saves you time — [support development ♥](https://pay.cloudtips.ru/p/ac545b44).

## Features
- 🎯 **One input + “Download”** — paste a video, post, reel, TikTok or YouTube link.
- 🌍 **6 languages**: русский, English, Deutsch, 中文, қазақша, 한국어 — switcher in the popup, browser language by default.
- 🧠 **Finds the whole file itself**: helper → direct MP4 → open tab data → `og:video` → `video_url` → Instagram API → TikTok → embed. Junk is never saved — it tells you straight.
- ⚡ **Auto-save** (off by default): watch a video — the file saves itself. Trivia and animations are skipped.
- 🛑 **Stop** anytime, closing the popup never interrupts a download.
- 📜 **History**: last 7 files, “Show” opens the folder, ✕ deletes from disk.
- 🌗 Light / dark / system, macOS-style glass.
- 🖥️ **Local helper** (yt-dlp): Windows — `helper\run-helper.bat`, macOS/Linux — `helper\run-helper.sh` (needs node and yt-dlp in PATH). Details below.
- 🧩 **Browsers**: Chrome, Edge, Brave, Vivaldi, Opera, Yandex, Firefox (MV3). **OS**: Windows, macOS, Linux.

## 1-minute install

**Option A — ZIP (easiest):**
1. Download `videoloader.zip` from [Releases](../../releases) and unpack it.
2. Open `chrome://extensions/` → enable **Developer mode**.
3. **Load unpacked** → pick the `videoloader` folder.
4. Pin the icon. Done.

**Option B — command line:**
```powershell
git clone https://github.com/askoreebipiatnica-cyber/VideoLoader.git
```
Then steps 2–4 from option A with the cloned folder.

Without the helper it also works: enable **Auto-save**, open the video, press Play — the file saves itself.

## Local helper
A server on your machine (Node + yt-dlp), `127.0.0.1` only. Install yt-dlp first:
- Windows: download `yt-dlp.exe` from https://github.com/yt-dlp/yt-dlp/releases into the extension folder (next to `manifest.json`), then run `helper/run-helper.bat`.
- macOS/Linux: install yt-dlp into PATH (`brew install yt-dlp` or via pip), then `chmod +x helper/run-helper.sh && ./helper/run-helper.sh`.
- Downloads via yt-dlp **with your Chrome cookies** — private posts work too.
- Not running — the extension silently falls back to the built-in chain.
- Finished files go to `helper/out`, swept every 30 minutes (files older than an hour).

## Firefox install
`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json` from the folder. Works until browser restart (no other way without Mozilla signing).

## Honest limits
- Only whole MP4/WEBM files. No whole file — it says so, never a broken file.
- HLS (`.m3u8`) / DASH (`.mpd`) are playlists, not video.
- Top-quality YouTube is DASH-only — grabs whatever is served whole.
- Sites change markup — fixed by updating.

## For developers
```powershell
node --check background.js popup.js content.js parser.js
node test/run.mjs    # 83 parser unit tests
node test/chain.mjs  # 35 end-to-end chain tests
node test/i18n.mjs   # 23 locale completeness tests
```
Icons: `scripts/make-icons.ps1`. Demo GIF: `scripts/make-demo.py`. Version lives in `manifest.json`, shown in the popup automatically.
