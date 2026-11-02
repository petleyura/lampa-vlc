# Lampa VLC Player

Незалежний повноекранний плеєр для медіапорталу **Lampa** у стилі VLC. Плагін перехоплює запуск відео, скасовує штатний плеєр Lampa та відкриває власний інтерфейс.

> **Поточна версія: v0.5.0.** У меню Lampa плеєр зараз називається **VLC Player**. Перейменування на **Кастомний плеєр** заплановане в окремому оновленні; у поточній версії пункту «Кастомний плеєр» ще немає.

---

## Українська

### Призначення

Плеєр призначений для перегляду відео в Lampa без штатного плеєра: власні контролери, прогрес-бар, швидкість відтворення, діагностика та підтримка Tizen AVPlay.

### Встановлення в Lampa

1. Відкрийте Lampa.
2. Перейдіть: **Налаштування → Плагіни → Додати плагін** (у деяких версіях Lampa розділ може називатися **Розширення**).
3. Вкажіть адресу плагіна:

   ```
   https://cdn.jsdelivr.net/gh/petleyura/lampa-vlc@main/Lampa-VLC-Player.js
   ```

4. Підтвердіть додавання та перезавантажте Lampa (F5).

Для локальної розробки можна розмістити `Lampa-VLC-Player.js` на власному HTTP-сервері та вказати його URL.

### Вибір плеєра

Після встановлення відкрийте: **Налаштування → Плеєр**.

- **Плеєр** — виберіть **VLC Player** для звичайного відео.
- **Плеєр для торентів** — виберіть **VLC Player** для потоків TorrServer.
- **Плеєр для IPTV** — пункт є, але перехоплення IPTV у v0.5.0 **не реалізовано**.

Якщо вибрано інший плеєр, плагін не втручається у відтворення.

### Можливості

- перехоплення запуску відео та блокування штатного плеєра Lampa;
- власний повноекранний інтерфейс;
- play/pause, перемотування, прогрес-бар, швидкість 0.5×–2×;
- керування з клавіатури та базові команди пульта;
- HTML5-рушій для ПК/Android/webOS;
- Tizen AVPlay, якщо доступний `webapis.avplay`;
- автоматичний fallback AVPlay → HTML5;
- Debug Panel;
- збереження прогресу через Timeline Lampa.

### Формати відео

Плагін **не містить власних декодерів**. Усе залежить від HTML5-рушія браузера або Tizen AVPlay.

| Контейнер | Стан |
|---|---|
| MP4 | HTML5 — типово; на Tizen AVPlay — за специфікацією Samsung; **на реальних пристроях не тестовано** |
| WebM | залежить від браузера; на Tizen/webOS не підтверджено |
| MKV | у Chromium часто не відтворюється; Tizen AVPlay/webOS — за специфікацією; **не тестовано** |
| TS/M2TS | залежить від платформи; **не тестовано** |
| AVI | у Chromium зазвичай ні; Tizen AVPlay/webOS — за специфікацією; **не тестовано** |
| HLS/DASH | **не реалізовано** |

### Відеокодеки

| Кодек | Стан |
|---|---|
| H.264 | базова підтримка HTML5/AVPlay; **не тестовано на пристроях** |
| HEVC | лише якщо підтримує браузер/ОС/AVPlay; **умовно** |
| AV1 | залежить від браузера/моделі TV; **умовно** |
| VP9 | залежить від браузера/моделі TV; **умовно** |
| MPEG-2 | зазвичай лише на TV-рушіях; **умовно** |

### Аудіокодеки

| Кодек | Стан |
|---|---|
| AAC | типова підтримка HTML5/AVPlay |
| MP3 | типова підтримка HTML5/AVPlay |
| Opus/FLAC | залежить від браузера/моделі |
| AC-3 | у Chromium **немає**; Tizen AVPlay — так; webOS — за моделлю |
| E-AC-3 | у Chromium **немає**; Tizen AVPlay — так; webOS — за моделлю |
| DTS/DTS-HD/TrueHD | у HTML5 **немає**; на TV — за моделлю; переважно не підтримується |

**Вибір аудіодоріжок у UI відсутній.** `Html5Engine.audioTracks()` у Chromium зазвичай повертає `null`; Tizen AVPlay має технічну можливість вибору, але кнопок у панелі ще немає.

### Субтитри

- WebVTT — лише якщо браузер/потік уже надає `textTracks`.
- UI вибору субтитрів **немає**.
- Зовнішні SRT/ASS плагіном **не підключаються**.
- Tizen AVPlay має текстовий трек, але UI теж немає.

### Сумісність

| Платформа | Стан |
|---|---|
| Windows Chrome/Edge | HTML5; **на реальному пристрої не тестовано** |
| Android TV | HTML5/WebView; **не тестовано** |
| Samsung Tizen | AVPlay, якщо є `webapis.avplay`; інакше HTML5; **не тестовано на TV** |
| LG webOS | HTML5; **не тестовано** |

Плагін не містить нативних бібліотек і не встановлює зовнішні плеєри.

### Відомі обмеження

- немає UI вибору аудіодоріжок і субтитрів;
- IPTV-пункт є, але IPTV не перехоплюється;
- HLS/DASH не підтримуються;
- MKV/HEVC/AC-3/DTS залежать від браузера або моделі TV;
- власних декодерів немає;
- Debug Panel увімкнена завжди;
- повноекранний режим — у межах вікна браузера, без Fullscreen API;
- на частині моделей Tizen відео AVPlay може не композитися з HTML-панеллю;
- реальні тести на Tizen/webOS/Android TV не проводилися.

### Версія та ліцензія

- Версія: **v0.5.0** (2026-11-01).
- Історія змін: [CHANGELOG.md](CHANGELOG.md).
- Ліцензія: [MIT](LICENSE).

---

## English

### Purpose

A standalone full-screen player for the **Lampa** media portal with a VLC-style interface. The plugin intercepts playback, aborts Lampa's stock player, and opens its own UI.

> **Current version: v0.5.0.** The Lampa menu item is currently named **VLC Player**. The planned rename to **Кастомний плеєр** (Custom Player) is not available in this version yet.

### Installation

1. Open Lampa.
2. Go to **Settings → Plugins → Add plugin** (in some Lampa versions the section is called **Extensions**).
3. Enter the plugin URL:

   ```
   https://cdn.jsdelivr.net/gh/petleyura/lampa-vlc@main/Lampa-VLC-Player.js
   ```

4. Confirm and reload Lampa (F5).

For local development, serve `Lampa-VLC-Player.js` from your own HTTP server and use that URL.

### Selecting the player

Open **Settings → Player**:

- **Player** — select **VLC Player** for regular video.
- **Player for torrents** — select **VLC Player** for TorrServer streams.
- **Player for IPTV** — the option exists, but IPTV interception is **not implemented** in v0.5.0.

If another player is selected, the plugin does not interfere with playback.

### Features

- intercepts playback and blocks Lampa's stock player;
- custom full-screen UI;
- play/pause, seeking, progress bar, 0.5×–2× speed;
- keyboard and basic remote control;
- HTML5 engine for desktop/Android/webOS;
- Tizen AVPlay when `webapis.avplay` is available;
- automatic AVPlay → HTML5 fallback;
- Debug Panel;
- progress saving through Lampa Timeline.

### Video containers

The plugin **does not bundle decoders**. Support depends on the browser's HTML5 engine or Tizen AVPlay.

| Container | Status |
|---|---|
| MP4 | HTML5 — typical; Tizen AVPlay — per Samsung specification; **not device-tested** |
| WebM | browser-dependent; Tizen/webOS not confirmed |
| MKV | often unsupported in Chromium; Tizen AVPlay/webOS per specification; **not tested** |
| TS/M2TS | platform-dependent; **not tested** |
| AVI | usually not in Chromium; Tizen AVPlay/webOS per specification; **not tested** |
| HLS/DASH | **not implemented** |

### Video codecs

| Codec | Status |
|---|---|
| H.264 | basic HTML5/AVPlay support; **not device-tested** |
| HEVC | only if the browser/OS/AVPlay supports it; **conditional** |
| AV1 | browser/TV model dependent; **conditional** |
| VP9 | browser/TV model dependent; **conditional** |
| MPEG-2 | mostly TV engines only; **conditional** |

### Audio codecs

| Codec | Status |
|---|---|
| AAC | typical HTML5/AVPlay support |
| MP3 | typical HTML5/AVPlay support |
| Opus/FLAC | browser/model dependent |
| AC-3 | **not in Chromium**; Tizen AVPlay — yes; webOS — model dependent |
| E-AC-3 | **not in Chromium**; Tizen AVPlay — yes; webOS — model dependent |
| DTS/DTS-HD/TrueHD | **not in HTML5**; TV model dependent; mostly unsupported |

**There is no audio-track selection UI.** `Html5Engine.audioTracks()` usually returns `null` in Chromium; Tizen AVPlay has the technical capability, but no panel controls yet.

### Subtitles

- WebVTT only when the browser/stream already exposes `textTracks`.
- No subtitle selection UI.
- External SRT/ASS files are **not** loaded by the plugin.
- Tizen AVPlay has a text track, but no UI either.

### Compatibility

| Platform | Status |
|---|---|
| Windows Chrome/Edge | HTML5; **not device-tested** |
| Android TV | HTML5/WebView; **not tested** |
| Samsung Tizen | AVPlay when `webapis.avplay` exists; otherwise HTML5; **not tested on a TV** |
| LG webOS | HTML5; **not tested** |

The plugin does not include native libraries and does not launch external players.

### Known limitations

- no audio/subtitle selection UI;
- IPTV option exists but IPTV is not intercepted;
- no HLS/DASH support;
- MKV/HEVC/AC-3/DTS depend on the browser or TV model;
- no bundled decoders;
- Debug Panel is always enabled;
- full-screen mode is limited to the browser window (no Fullscreen API);
- on some Tizen models AVPlay video may not composite with the HTML panel;
- no real-device testing on Tizen/webOS/Android TV has been performed.

### Version and license

- Version: **v0.5.0** (2026-11-01).
- Changelog: [CHANGELOG.md](CHANGELOG.md).
- License: [MIT](LICENSE).
