# Lampa VLC Player

Незалежний повноекранний плеєр для медіапорталу **Lampa** у стилі VLC. Плагін перехоплює запуск відео, скасовує штатний плеєр Lampa та відкриває власний інтерфейс.

> **Поточна версія: v0.6.0.** У меню Lampa плеєр зараз називається **VLC Player**. Перейменування на **Кастомний плеєр** заплановане в окремому оновленні; у поточній версії пункту «Кастомний плеєр» ще немає.

Сторінка проєкту: https://petleyura.github.io/lampa-vlc/

---

## Українська

### Призначення

Плеєр призначений для перегляду відео в Lampa без штатного плеєра: власні контролери, прогрес-бар, швидкість відтворення, діагностика та підтримка Tizen AVPlay.

### Встановлення в Lampa

1. Відкрийте Lampa.
2. Перейдіть: **Налаштування → Плагіни → Додати плагін** (у деяких версіях Lampa розділ може називатися **Розширення**).
3. Вкажіть адресу плагіна:

   ```
   https://petleyura.github.io/lampa-vlc/Lampa-VLC-Player.js
   ```

4. Підтвердіть додавання та перезавантажте Lampa (F5).

Для локальної розробки можна розмістити `Lampa-VLC-Player.js` на власному HTTP-сервері та вказати його URL.

### Вибір плеєра

Після встановлення відкрийте: **Налаштування → Плеєр**.

- **Плеєр** — виберіть **VLC Player** для звичайного відео.
- **Плеєр для торентів** — виберіть **VLC Player** для потоків TorrServer.
- **Плеєр для IPTV** — пункт є, але перехоплення IPTV у v0.6.0 **не реалізовано**.

Якщо вибрано інший плеєр, плагін не втручається у відтворення.

### Можливості

- перехоплення запуску відео та блокування штатного плеєра Lampa;
- власний повноекранний інтерфейс;
- play/pause, перемотування, прогрес-бар, швидкість 0.5×–2×;
- керування з клавіатури та базові команди пульта;
- HTML5-рушій для ПК/Android/webOS;
- Tizen AVPlay, якщо доступний `webapis.avplay`;
- автоматичний fallback AVPlay → HTML5;
- вибір аудіодоріжки, якщо рушій надає список доріжок;
- **AudioSyncEngine** для torrent-джерел із AC-3/E-AC-3 у Chromium: `<video muted>` + WASM-декодер + WebAudio;
- українська Debug Panel;
- збереження прогресу через Timeline Lampa.

### AudioSyncEngine (Етап 6.4.3)

Для torrent-джерел із AC-3/E-AC-3 на ПК (Chrome/Edge) плагін може додатково
завантажити `vendor/mediabunny.min.mjs` + `vendor/mediabunny-ac3.min.mjs`
(разом ≈1,9 МБ, ліниво, лише коли потрібен декодер) і відтворювати звук через
WebAudio, тримаючи `<video>` без звуку.

- аудіо синхронізується за `video.currentTime`;
- підтримуються Play/Pause, Seek, перемикання доріжок без перезапуску відео;
- E-AC-3 5.1 downmix у stereo виконує WebAudio;
- якщо WASM/WebAudio не запустилися, відео повертається до звичайного HTML5-режиму;
- **не активується на Tizen AVPlay** і не заявляє підтримку TV без тестів.

### Діагностика

Debug Panel показує:

- **ШВИДКІСТЬ ЗАВАНТАЖЕННЯ** — фактичні `transferSize` з Resource Timing, якщо браузер їх надає; інакше явно позначена оцінка за приростом буфера. Додаткових мережевих запитів для цього немає.
- **ФОРМАТ ВІДЕО** — контейнер, відеокодек, роздільність і FPS лише з фактичних метаданих (`data.ffprobe`, AVPlay або іншого API); якщо даних немає — `Н/Д`/`Недоступно`. Кодек не визначається за розширенням URL.
- **АУДІОДОРІЖКИ** — номер, назва/мова, кодек, канали, частота та активна доріжка з метаданих рушія.
- **AudioSync** — відео- та аудіорушій, кодеки, активна доріжка, синхронізація в мс, аудіобуфер, PCM-фрагменти, underruns, resyncs, остання помилка.
- Для торентів метадані додатково читаються з TorrServer `/ffp/{hash}/{id}`; якщо endpoint недоступний, показуються `Н/Д`.

### Формати відео

Плагін не має власного відеодекодера: відео завжди відтворює HTML5 або Tizen AVPlay.
AudioSync додає лише аудіодекодер для AC-3/E-AC-3 у torrent-режимі.

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
| AC-3 | Chromium — **AudioSync/WASM для torrent**; без нього HTML5 не декодує; Tizen AVPlay — за моделлю; webOS — за моделлю |
| E-AC-3 | Chromium — **AudioSync/WASM для torrent**; без нього HTML5 не декодує; Tizen AVPlay — за моделлю; webOS — за моделлю |
| DTS/DTS-HD/TrueHD | у HTML5 **немає**; на TV — за моделлю; переважно не підтримується |

**Вибір аудіодоріжок** доступний через кнопку **«Аудіодоріжка»**, якщо рушій надає список:

- **Tizen AVPlay** — реальне перемикання через `setSelectTrack`;
- **HTML5** — лише якщо браузер реалізує `HTMLMediaElement.audioTracks` (у Chromium зазвичай **ні**);
- **AudioSync для torrent AC-3/E-AC-3** — реальне перемикання через WASM/WebAudio без перезапуску відео;
- якщо списку немає — плеєр показує пояснення, а не порожнє меню.

Плагін не вигадує мову, кодек чи кількість каналів: показуються лише дані рушія, інакше `Н/Д`.

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

- немає UI вибору субтитрів;
- нативний HTML5-вибір аудіодоріжок залежить від `HTMLMediaElement.audioTracks` (у Chromium зазвичай відсутній); AudioSync дає перемикання для torrent AC-3/E-AC-3;
- IPTV-пункт є, але IPTV не перехоплюється;
- HLS/DASH не підтримуються;
- MKV/HEVC/AC-3/DTS залежать від браузера або моделі TV;
- AudioSync (AC-3/E-AC-3) активний лише для torrent-джерел на ПК; перевірено в Chrome та Edge (Chromium) у локальному harness, реальна Lampa/TV — ні;
- AudioSync ліниво завантажує ~1,9 МБ vendor-модулів; якщо CSP/мережа блокують їх, AC-3/E-AC-3 звуку не буде;
- DTS і повне перемикання доріжок у нативному HTML5 не реалізовані;
- Debug Panel увімкнена завжди;
- повноекранний режим — у межах вікна браузера, без Fullscreen API;
- на частині моделей Tizen відео AVPlay може не композитися з HTML-панеллю;
- реальні тести на Tizen/webOS/Android TV не проводилися.

### Версія та ліцензія

- Версія: **v0.6.0** (2026-11-02).
- Історія змін: [CHANGELOG.md](CHANGELOG.md).
- Ліцензія: [MIT](LICENSE).

---

## English

### Purpose

A standalone full-screen player for the **Lampa** media portal with a VLC-style interface. The plugin intercepts playback, aborts Lampa's stock player, and opens its own UI.

> **Current version: v0.6.0.** The Lampa menu item is currently named **VLC Player**. The planned rename to **Кастомний плеєр** (Custom Player) is not available in this version yet.

Project page: https://petleyura.github.io/lampa-vlc/

### Installation

1. Open Lampa.
2. Go to **Settings → Plugins → Add plugin** (in some Lampa versions the section is called **Extensions**).
3. Enter the plugin URL:

   ```
   https://petleyura.github.io/lampa-vlc/Lampa-VLC-Player.js
   ```

4. Confirm and reload Lampa (F5).

For local development, serve `Lampa-VLC-Player.js` from your own HTTP server and use that URL.

### Selecting the player

Open **Settings → Player**:

- **Player** — select **VLC Player** for regular video.
- **Player for torrents** — select **VLC Player** for TorrServer streams.
- **Player for IPTV** — the option exists, but IPTV interception is **not implemented** in v0.6.0.

If another player is selected, the plugin does not interfere with playback.

### Features

- intercepts playback and blocks Lampa's stock player;
- custom full-screen UI;
- play/pause, seeking, progress bar, 0.5×–2× speed;
- keyboard and basic remote control;
- HTML5 engine for desktop/Android/webOS;
- Tizen AVPlay when `webapis.avplay` is available;
- automatic AVPlay → HTML5 fallback;
- audio-track selection when the engine exposes a track list;
- **AudioSyncEngine** for torrent AC-3/E-AC-3 in Chromium: muted `<video>` + WASM decoder + WebAudio;
- Ukrainian Debug Panel;
- progress saving through Lampa Timeline.

### AudioSyncEngine (Stage 6.4.3)

For torrent sources with AC-3/E-AC-3 on desktop Chrome/Edge, the plugin can lazily
load `vendor/mediabunny.min.mjs` + `vendor/mediabunny-ac3.min.mjs` (≈1.9 MB total,
only when a software decoder is needed) and play audio through WebAudio while
keeping `<video>` muted.

- audio is synchronized against `video.currentTime`;
- Play/Pause, seeking, and track switching without restarting video;
- E-AC-3 5.1 is downmixed to stereo by WebAudio;
- if WASM/WebAudio fails, video returns to the normal HTML5 path;
- **not activated on Tizen AVPlay**; no TV support is claimed without testing.

### Diagnostics

The Debug Panel shows:

- **Download speed** — actual `transferSize` from Resource Timing when exposed; otherwise an explicitly marked estimate based on buffer growth. No extra network requests are made.
- **Video format** — container, video codec, resolution, and FPS only from actual metadata (`data.ffprobe`, AVPlay, or another API); otherwise `N/A`/`Unavailable`. The codec is not inferred from the URL extension.
- **Audio tracks** — number, title/language, codec, channels, sample rate, and the active track from engine metadata.
- **AudioSync** — video/audio engine, codecs, active track, sync in ms, audio buffer, PCM fragments, underruns, resyncs, last error.
- For torrents, metadata is also read from TorrServer `/ffp/{hash}/{id}`; if the endpoint is unavailable, `N/A` is shown.

### Video containers

The plugin has no video decoder; video is always rendered by HTML5 or Tizen AVPlay.
AudioSync only adds an AC-3/E-AC-3 audio decoder for the torrent path.

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
| AC-3 | Chromium — **AudioSync/WASM for torrents**; HTML5 alone cannot decode; Tizen AVPlay — model dependent; webOS — model dependent |
| E-AC-3 | Chromium — **AudioSync/WASM for torrents**; HTML5 alone cannot decode; Tizen AVPlay — model dependent; webOS — model dependent |
| DTS/DTS-HD/TrueHD | **not in HTML5**; TV model dependent; mostly unsupported |

**Audio-track selection** is available through the **Audio track** button when the engine exposes a list:

- **Tizen AVPlay** — real switching via `setSelectTrack`;
- **HTML5** — only when the browser implements `HTMLMediaElement.audioTracks` (usually **not** in Chromium);
- **AudioSync for torrent AC-3/E-AC-3** — real switching through WASM/WebAudio without restarting video;
- if no list is available, the player shows an explanation instead of an empty menu.

The plugin never invents language, codec, or channel data: only engine metadata is shown; otherwise `Н/Д` (N/A).

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

- no subtitle selection UI;
- native HTML5 audio-track selection depends on `HTMLMediaElement.audioTracks` (usually absent in Chromium); AudioSync provides switching for torrent AC-3/E-AC-3;
- IPTV option exists but IPTV is not intercepted;
- no HLS/DASH support;
- MKV/HEVC/AC-3/DTS depend on the browser or TV model;
- AudioSync (AC-3/E-AC-3) is active only for torrents on desktop; tested in Chrome and Edge (Chromium) in a local harness, not in real Lampa/TV;
- AudioSync lazily loads ~1.9 MB of vendor modules; if CSP/network blocks them, AC-3/E-AC-3 will have no sound;
- DTS and full native HTML5 track switching are not implemented;
- Debug Panel is always enabled;
- full-screen mode is limited to the browser window (no Fullscreen API);
- on some Tizen models AVPlay video may not composite with the HTML panel;
- no real-device testing on Tizen/webOS/Android TV has been performed.

### Version and license

- Version: **v0.6.0** (2026-11-02).
- Changelog: [CHANGELOG.md](CHANGELOG.md).
- License: [MIT](LICENSE).
