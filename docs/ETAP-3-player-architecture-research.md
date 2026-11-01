# Етап 3. Архітектурне дослідження універсального відеоплеєра для Lampa

**Проєкт:** Lampa VLC Player
**Репозиторій:** https://github.com/petleyura/lampa-vlc
**Дата:** 01.11.2026
**Статус:** дослідження завершено; код не змінювався, файли проєкту не переписувалися, бібліотеки не встановлювалися.

Джерела: вихідний код Lampa (дзеркало `yumata/lampa-source`, коміт `71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2`), офіційна документація Samsung, LG, VideoLAN, FFmpeg, MDN, репозиторії GitHub/GitLab.

---

## 1. Короткий висновок

**Проєкт реалізуємо, але не через вбудовування libVLC чи FFmpeg.**

1. **libVLC у вебзастосунок вбудувати неможливо.** libVLC — це C-бібліотека (LGPL 2.1) для нативних застосунків; у браузері вона не завантажується. Єдиний «VLC для Tizen» (`videolan/vlc-tizen`) — це **мобільний** порт для Tizen-телефонів на C/EFL, а не TV-плеєр і не бібліотека для JS. `vlc.js` (WASM-порт) — експериментальний PoC, який сам автор описує як «буде можливо в майбутньому» і якому потрібні WebCodecs, завантаження модулів і сокети.
2. **FFmpeg.wasm для відтворення непридатний.** Офіційні заміри ffmpeg.wasm: **0.04×–0.08×** від нативної швидкості на десктопному Intel i5; на TV-чіпі (ARM, 1–2 ГБ RAM) це означає, що 1080p не декодується в реальному часі, а 4K — поготів. Апаратного декодування в ffmpeg.wasm немає, до того ж діє «hard limit» 2 ГБ на вхідний файл і відсутні сокети.
3. **WebCodecs — єдина альтернатива, яку варто перевірити,** але вона не демуксить контейнери (потрібен власний демуксер) і невідомо, чи доступна вона у WebView Tizen TV та браузері webOS TV.
3. **Апаратне декодування дають лише платформні рушії:** **Samsung AVPlay** (Tizen) і **HTML5 `<video>`** (webOS, де відео рендериться на окремій апаратній площині). Саме їх і треба використовувати — кожен у своєму «адаптері» під спільним VLC-інтерфейсом.
4. **На Tizen AVPlay — не альтернатива, а необхідність:** Samsung прямо документує, що адаптивний стрімінг, 4K UHD і розширені субтитри в HTML5 не підтримуються, а MSE обмежений FHD («MSE supports resolutions up to FHD; it does not support UHD»). Перемикання аудіодоріжок і внутрішніх субтитрів на Tizen є **тільки** в AVPlay.
5. **На webOS:** офіційно підтримуються лише HTTP/HTTPS і HLS (DASH — через MSE/dash.js); кодеки/контейнери — за таблицями LG; перемикання доріжок — через `video.audioTracks` (за твердженням LG-інженера) або Luna-сервіс `com.webos.media.selectTrack` із `video.mediaId` (так робить Lampa); субтитри офіційно лише зовнішні WebVTT.
6. **Меню вибору плеєра в Lampa розширюється без правок файлів Lampa:** три параметри `player`, `player_torrent`, `player_iptv` живуть у `Lampa.Params.values` і рендеряться при відкритті екрана налаштувань; плагін може додати значення `vlc` через `Lampa.Params.select(...)` після `app:ready` (або через офіційний `Lampa.SettingsApi.addComponent/addParam`). Далі перехоплення `create` + `abort()` вирішує, хто грає.
7. **IPTV через `create` не перехоплюється:** `Player.iptv()` не надсилає подію `create` (перевірено кодом). Потрібне окреме рішення — обгортка `Lampa.Player.iptv` із власною логікою каналів.

**Головне рішення:** будувати **гібридний плеєр**: один VLC-подібний UI + набір платформних «рушіїв» (AVPlay для Tizen, HTML5+Luna для webOS, HTML5/hls.js для ПК). libVLC і FFmpeg.wasm — відкинути як технічно/продуктивно недоцільні.

---

## 2. Порівняльна таблиця технологій

| Критерій | VLC / libVLC | FFmpeg (native) | FFmpeg.wasm | HTML5 `<video>` | Samsung AVPlay | Tizen WASM Player | LG webOS (HTML5 + Luna) |
|---|---|---|---|---|---|---|---|
| Що це | C-рушій + плеєр | C-фреймворк | WASM-порт FFmpeg | Браузерний елемент | Платформний медіаплеєр Samsung | Низькорівневий WASM-extension Samsung | Браузерний рушій + сервіси webOS |
| Доступність у Lampa (web) | **Ні** | **Ні** (потрібен нативний застосунок/сервер) | Так (WASM) | Так | Так, у Tizen-застосунку (`webapis.avplay`) | Так, у Tizen-застосунку з WASM-модулем | Так (`<video>`); Luna — у webOS-застосунку |
| Апаратне декодування | Так (нативно) | Так (нативно) | **Ні** | Так (для підтримуваних кодеків) | Так (штатний пайплайн) | Пайплайн платформи (HW не підтверджено) | Так (окрема відеоплощина) |
| Підтримка контейнерів | Усі | Усі | Усі (програмно) | MP4/WebM/Ogg; MKV — нестабільно | AVI/MKV/MP4/TS/MOV/FLV/VOB… | Залежить від кодеків платформи | MP4/MKV/TS/AVI/MOV… (за версією) |
| 4K/HEVC/HDR | Так | Так | Ні (практично) | На Tizen — **ні** (MSE ≤ FHD) | Так (4K/HEVC); HDR — платформа | ⚠️ за медіаспецифікацією | Так (UHD-моделі) |
| Перемикання аудіодоріжок | Так | Так | Так (програмно) | Обмежено (`audioTracks`) | Так (`setSelectTrack`) | Так (окремі треки) | Через `audioTracks`/Luna |
| Субтитри | Усі | Усі | SRT/ASS через libass | WebVTT `<track>` | Внутрішні + зовнішні SMI/TTML (локальні) | Залежить від застосунку | Лише зовнішні VTT |
| Ліцензія | LGPL 2.1 (libVLC); сам VLC — GPLv2+ | LGPL 2.1+ (GPL за `--enable-gpl`) | LGPL/GPL залежно від збірки | — | Пропрієтарний API | Пропрієтарний SDK | — |
| Складність інтеграції | Дуже висока (нативний порт) | Висока (нативний порт/сервер) | Середня, але марна | Низька | Середня | Дуже висока (C++/WASM, демуксер) | Середня |
| Придатність для проєкту | **Ні** | **Ні** | **Ні** | Так (ПК, webOS) | **Так (Tizen)** | Можливо, пізніше | **Так (webOS)** |

Джерела: [libVLC](https://www.videolan.org/vlc/libvlc.html), [VideoLAN Legal](https://www.videolan.org/legal.html), [ffmpeg.wasm Performance](https://ffmpegwasm.netlify.app/docs/performance), [Samsung AVPlay](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html), [Samsung WASM Player](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/tizen-wasm-player/tizen-wasm-player-features.html), [LG Streaming Protocol & DRM](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm).

### 2.1. Окремо: WebCodecs як потенційна альтернатива

WebCodecs — браузерний API покадрового декодування (`VideoDecoder`/`AudioDecoder`, `VideoFrame`, `EncodedVideoChunk`) з підказкою `hardwareAcceleration: "prefer-hardware"` і перевіркою `VideoDecoder.isConfigSupported()`. Він **не демуксить** контейнери — потрібен окремий JS-демуксер (Mediabunny, web-demuxer), а покриття HEVC нерівномірне (суттєві прогалини поза Apple-платформами).

Підтримка: Chrome 94+, Samsung Internet 17+, Safari 16.4 (частково), Firefox 130+. **Чи доступний WebCodecs у WebView Tizen TV і в браузері LG webOS TV — не підтверджено.** Це єдиний шлях до апаратного декодування з власним рендерером, але він потребує власного демуксера й перевірки на реальних телевізорах.

Джерела: [MDN WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), [VideoDecoder.configure](https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/configure), [caniuse](https://caniuse.com/webcodecs).

---

## 3. Аналіз Samsung Tizen

### 3.1. AVPlay — штатний шлях

AVPlay — Samsung Product API (`webapis.avplay`), «Since 2.3», Product: TV/AV/B2B. Підключається через `$WEBAPIS/webapis/webapis.js`; відео виводиться в `<object type="application/avplayer">`, положення/розмір задаються `setDisplayRect(x, y, w, h)` у системі координат 1920×1080 незалежно від роздільності застосунку.

Життєвий цикл: `open(url)` → IDLE → `prepare()`/`prepareAsync()` → READY → `play()` → PLAYING/PAUSED → `close()` → NONE.
Джерело: [AVPlay API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html), [Using AVPlay](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html).

Ключове: **AVPlay приймає віддалені URI** (`open()` підтримує абсолютні локальні шляхи та мережеві URI), тобто посилання TorrServer `/stream/...` підходить без посередників.

### 3.2. HTML5 на Tizen — обмежений

Samsung прямо зазначає: «common media formats can be played using the HTML5 `<video>`… To play media content with features not supported in HTML5, such as adaptive streaming, additional subtitle formats, and 4K UHD video, use… AVPlay» ([Using AVPlay](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html)).

Додатково в специфікаціях усіх model group: «**MSE supports resolutions up to FHD; it does not support UHD**» ([2024 TV Video Specifications](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2024-tv-video-specifications.html)).

Наслідок: HLS через `hls.js` на Tizen дасть максимум 1080p; 4K, HEVC-4K, HDR — лише AVPlay.

### 3.3. Кодеки й контейнери (2024 model groups)

- Контейнери: AVI, MKV, ASF, MP4, 3GP, MOV, FLV, VRO, VOB, PS, TS, WebM, RMVB.
- Відео: H.264 BP/MP/HP (до 4096×2160@60; FHD L4.2, UHD L5.1), HEVC Main/Main10 (4K; 8K на PREMIUM1/2; L4.1 FHD, L5.2 UHD, L6.1 8K), MPEG-4 SP/ASP, VC-1, MPEG-2, MPEG-1, MJPEG, H.263, VP6, VP8, VP9, AV1.
- Аудіо: AC3, LPCM, ADPCM, AAC, HE-AAC, WMA, DD+, MP3, MPEG-H, AC-4, OPUS, G.711.
- Обмеження: **HEVC лише в MKV/MP4/TS**; GMC/Qpel не підтримуються; контент не масштабується — має відповідати специфікації.
- **DTS, DTS-HD, FLAC, TrueHD у списках 2018 і 2024 не згадані** — підтримка не підтверджена.

Джерело: [2024 TV Video Specifications](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2024-tv-video-specifications.html), [2018 TV Video Specifications](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2018-tv-video-specifications.html).

### 3.4. Дорожки та субтитри

- `getTotalTrackInfo()` повертає `{type: 'AUDIO'|'TEXT'|'VIDEO', index, extra_info{language, track_lang, channels}}`. Виклик дозволений у READY/PLAYING/PAUSED, причому **READY — лише після синхронного `prepare()`**.
- `setSelectTrack('AUDIO', index)` — READY/PLAYING/PAUSED, але READY лише для Smooth Streaming; для прогресивного HTTP перемикання робити в PLAYING/PAUSED.
- `setSelectTrack('TEXT', index)` — внутрішні субтитри.
- `setExternalSubtitlePath(path)` приймає **лише абсолютний локальний шлях**: «AVPlay API supports only external subtitles accessed through absolute local paths». Віддалений `.srt` треба спершу завантажити Download API у `wgt-private-tmp`, потім викликати метод **до** `prepare()`.
- Формати зовнішніх субтитрів: SAMI (.smi, UTF-8), SMPTE-TT, DFXP (лише Smooth Streaming). SRT як sidecar офіційно не задокументований.
- `setSubtitlePosition(ms)` — зсув субтитрів.

Джерела: [Using AVPlay](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html), [Subtitles guide](https://developer.samsung.com/smarttv/develop/guides/multimedia/subtitles.html).

**Практичний висновок для Lampa:** зовнішні субтитри (SRT/VTT з TorrServer) простіше і надійніше рендерити **власним DOM-оверлеєм**, а не через AVPlay; внутрішні — через `setSelectTrack('TEXT', …)`.

### 3.5. Стрімінг і 4K

AVPlay підтримує прогресивний HTTP(S), HLS, MPEG-DASH, Smooth Streaming. Для 4K — `setStreamingProperty('SET_MODE_4K','TRUE')`; буфер — `setBufferingParam()` у стані IDLE. UDP/мультикаст не підтримується.

Джерела: [Adaptive Streaming](https://developer.samsung.com/smarttv/develop/guides/multimedia/adaptive-streaming.html), [Streaming Q&A](https://developer.samsung.com/smarttv/develop/faq/multimedia-streaming.html), [4K 8K UHD Video](https://developer.samsung.com/smarttv/develop/guides/multimedia/4k-8k-uhd-video.html).

### 3.6. Tizen WASM Player — що це і чому не зараз

Низькорівневий WebAssembly-extension: приймає **елементарні медіапакети** (encoded frames), декодує й рендерить їх пайплайн платформи; джерело для `HTMLMediaElement` через `ElementaryMediaStreamSource` + `ElementaryMediaTrack`. Демультиплексування й завантаження — **повністю на боці застосунку** (наприклад, FFmpeg, скомпільований у WASM).

Це означає: щоб відтворити MKV, треба написати власний демуксер (або портувати FFmpeg-демуксер у WASM) і передавати пакети в EMSS. Це не «drop-in» рішення, а окремий великий проєкт. Крім того, не підтверджено, з яких моделей/Tizen-версій він доступний, і чи вживається слово «hardware» щодо декодування в документації.

Джерело: [Tizen WASM Player Features](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/tizen-wasm-player/tizen-wasm-player-features.html), [Initializing WASM Player](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/tizen-wasm-player/using-tizen-wasm-player/initializing-wasm-player.html).

### 3.7. Практичний досвід: нативний libVLC на Tizen не запускається

Показовий кейс — проєкт Tessel («VLC TV» для Tizen). Його автор спершу зробив повний **нативний** порт libVLC під Tizen 5.0 ARM: «built cleanly, installed cleanly, but never launched on the retail TV» — launchpad retail-телевізора відмовляється запускати сторонні нативні бінарники (`type="capp"`) без партнерського сертифіката. Після цього проєкт переписали як **вебзастосунок на AVPlay**, і в README прямо сказано, що він «doesn't use libVLC».

Джерела: [WHY-WEB-APP.md](https://raw.githubusercontent.com/PatrickSt1991/tessel-tizen-tv/main/docs/WHY-WEB-APP.md), [tessel-tizen-tv](https://github.com/PatrickSt1991/tessel-tizen-tv).

Це емпіричне підтвердження висновку: **єдиний реальний шлях на Tizen — AVPlay у web-застосунку**, а не libVLC.

### 3.8. Контекст виконання: застосунок чи браузер

AVPlay доступний у **Tizen-застосунку** (`webapis`), а не в довільному браузері. Lampa має Tizen-обгортку (`index/tizen/index.html` + `loader.js`), яка завантажує `app.min.js` — тобто Lampa може працювати як Tizen-віджет. Якщо ж користувач відкриває Lampa у вбудованому браузері TV, `webapis` може бути відсутнім → залишиться лише HTML5.

Це потрібно перевірити на реальному пристрої: **наявність `webapis.avplay` у конкретному способі запуску Lampa** (не підтверджено документацією).

---

## 4. Аналіз LG webOS

### 4.1. Медіа-стек

webOS TV — вебстек на Chromium: 4.x = Chromium 53, 5.x = 68, 6.x = 79, 22 = 87, 23 = 94, 24 = 108, 25 = 120, 26 = 132 ([Web API and Web Engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)).

MSE: 3.x — Editor's Draft; 4.x — Proposed Rec 2016; 5.0+ — W3C Recommendation 17.11.2016. EME: 3.x — ED 2012; 4.x — WD 2015; 5.0+ — REC 2017 ([Streaming Protocol and DRM](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm)).

LG-специфічне поверх HTML5:
- `mediaOption` — JSON, URL-encoded, у `type` елемента `<source>`: `mediaTransportType`, `option.drm`, `option.adaptiveStreaming`, `option.transmission.playTime.start` ([mediaOption parameter](https://webostv.developer.lge.com/develop/guides/mediaoption-parameter)).
- Luna-сервіси: `luna://com.webos.service.drm`, `com.webos.applicationManager`, `webOS.service.request` ([webOSTV.js](https://webostv.developer.lge.com/develop/references/webostvjs-webos)).

Аналога Samsung AVPlay немає — LG пропонує використовувати стандартні веб-API.

### 4.2. Кодеки й контейнери (приклад webOS 6.0)

| Контейнер | Відео | Аудіо |
|---|---|---|
| .mkv | MPEG-2, MPEG-4, H.264, VP8, VP9, HEVC, AV1 | DD, DD+, AAC, PCM, DTS, MP1/2/3 |
| .mp4/.mov/.m4v | H.264, MPEG-4, HEVC, AV1 | DD, DD+, AAC, MP3, AC-4, MPEG-H |
| .ts/.trp/.tp/.mts | H.264, MPEG-2, HEVC | MP1/2/3, DD, DD+, AAC, PCM, AC-4 |
| .avi | Xvid, H.264, M-JPEG, MPEG-4 | MP1/2/3, DD, LPCM, ADPCM |
| .mpg/.mpeg/.dat, .vob | MPEG-1/2 | MP1/2/3, DD, LPCM |
| .asf/.wmv | VC-1 | WMA |

Обмеження: GMC/Qpel не підтримуються; AAC Main — ні; UHD-моделі мають окремий список для 4K (H.264/HEVC, DD/DD+/AAC); FLAC — 2 канали; **FLV і WebM-контейнер у списку відсутні**; DTS залежить від версії (у 22 — відсутній, у 23+ — є).

Джерело: [Video & Audio Format webOS 6.0](https://webostv.developer.lge.com/develop/specifications/video-audio-60) та аналогічні сторінки для 4.0/5.0/22/23/25/26.

### 4.3. Протоколи

Нативно: **HTTP/HTTPS і HLS**. DASH і Smooth Streaming офіційно не підтримуються (Smooth — «не рекомендується»); отже DASH — лише через MSE (`dash.js`).

HLS-обмеження нативного плеєра: не підтримуються `EXT-X-PROGRAM-DATE-TIME`, `EXT-X-DATERANGE`, `EXT-X-I-FRAMES-ONLY`, `EXT-X-SESSION-DATA`; FF/REW і швидкість ≠ 1.0 не підтримуються; сегменти аудіо/відео мають бути однакової тривалості.

Джерело: [Streaming Protocol and DRM](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm).

### 4.4. Аудіодоріжки

- LG-інженер на форумі стверджує, що `videoElement.audioTracks` підтримується з webOS 3.0, і наводить приклад ([форум](https://forum.webostv.developer.lge.com/t/video-multi-audio/24156)); у сусідньому треді перемикання не працює для live-каналів ([форум](https://forum.webostv.developer.lge.com/t/channel-multi-audio-selection/24666)).
- У Chromium `audioTracks` — «limited availability» ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks)).
- Lampa на webOS використовує **Luna**: підписку на `com.webos.media` за `video.mediaId`, читає `sourceInfo.programInfo[0].audioTrackInfo` / `subtitleTrackInfo` і викликає `selectTrack {type:'audio'|'text', mediaId, index}` ([webos/parser.js](https://raw.githubusercontent.com/yumata/lampa-source/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/interaction/player/video/webos/parser.js)).

Отже практичний шлях на webOS: **спробувати `audioTracks`; якщо список порожній — Luna `selectTrack` через `mediaId`; інакше — показати «доріжка одна»**. Офіційної документації LG на `selectTrack` не знайдено — механізм підтверджений лише практикою Lampa (не підтверджено офіційно).

### 4.5. Субтитри

Офіційно — лише зовнішній **WebVTT**; вбудовані/ASS/SRT не підтримуються (відповіді LG на форумах: [1](https://forum.webostv.developer.lge.com/t/subtitles-and-native-player/27908), [2](https://forum.webostv.developer.lge.com/t/web-os-hosted-app-subtitle-problem/28179)).

Практика: SRT конвертувати у VTT на клієнті; вбудовані субтитри MKV — рендерити власним DOM-оверлеєм, якщо вдасться отримати текст (наприклад, через TorrServer `/subs`, що віддає WebVTT — див. Етап 1).

### 4.6. Апаратне декодування й оверлеї

LG-інженер: «the video area becomes transparent and the video is rendered on a separate layer» — тобто відео йде окремою апаратною площиною, а напівпрозорі DOM/canvas-оверлеї над ним блендяться некоректно; потрібен непрозорий фон ([форум](https://forum.webostv.developer.lge.com/t/alpha-blending-of-canvas-on-top-of-video-looks-wrong/28222)).

Це важлива вимога до VLC-панелі: напівпрозора панель має бути **непрозорою або майже непрозорою**, інакше на webOS виникнуть артефакти.

Роздільність: графіка застосунку на UHD-моделях — до 1920×1080, відео — до 3840×2160; на FHD — 1280×720 графіка / 1920×1080 відео ([App Resolution](https://webostv.developer.lge.com/develop/specifications/app-resolution)).

### 4.7. Нативні застосунки та FFmpeg/libVLC

Офіційний webOS TV SDK — **лише вебзастосунки** ([Web App Types](https://webostv.developer.lge.com/develop/getting-started/web-app-types)). LG Seller Lounge прямо відповів: C/C++/FFmpeg на TV використати не можна, лише на сервері ([форум](https://forum.webostv.developer.lge.com/t/cant-use-c-or-c-on-webos-tv/3419)). Нативні C/C++ з `libndl-directmedia` існують лише в homebrew/root-екосистемі ([webosbrew](https://github.com/webosbrew/webosbrew.github.io)).

Luna-сервіс `com.webos.media` існує (webOS OSE), але офіційно «direct use… strongly discouraged» і для TV-застосунків не гарантується ([webOS OSE docs](https://www.webosose.org/docs/reference/ls2-api/com-webos-media/)).

**Висновок:** вбудувати libVLC/FFmpeg у webOS-застосунок Lampa неможливо; максимум — HTML5 + Luna.

---

## 5. Таблиця підтримки контейнерів і кодеків

Позначки: ✅ — підтверджено документацією; ⚠️ — залежить від моделі/версії; ❌ — не підтверджено/не підтримується.

### 5.1. Контейнери

| Контейнер | Tizen AVPlay | webOS HTML5 | Desktop Chrome | Примітка |
|---|---|---|---|---|
| MKV | ✅ | ✅ (за версією) | ⚠️/❌ | На ПК Chromium H.264-у-MKV часто не грає |
| MP4 | ✅ | ✅ | ✅ | |
| AVI | ✅ | ✅ | ❌ | |
| MOV | ✅ | ✅ | ✅ | |
| TS / M2TS | ✅ | ✅ | ❌ | |
| WebM | ✅ (VP8/VP9/AV1) | ⚠️ (контейнер не в списку) | ✅ | |
| MPEG (PS) | ✅ | ✅ | ❌ | |
| FLV | ✅ | ❌ (не в списку) | ❌ | |

### 5.2. Відеокодеки

| Кодек | Tizen AVPlay | webOS | Desktop | Апаратне декодування |
|---|---|---|---|---|
| H.264 | ✅ (до 4K@60) | ✅ | ✅ | Так (усі) |
| HEVC | ✅ (MKV/MP4/TS) | ✅ | ⚠️ (залежить від ОС) | Так |
| AV1 | ✅ (2024+) | ✅ (5.0+) | ⚠️ | Так (нові TV) |
| VP8/VP9 | ✅ | ✅ | ✅ | Так/частково |
| MPEG-2 | ✅ | ✅ | ❌ | Так |
| MPEG-4 SP/ASP | ✅ | ✅ | ❌ | Так |
| VC-1 | ✅ | ✅ | ❌ | Так |

### 5.3. Аудіокодеки

| Кодек | Tizen AVPlay | webOS | Desktop | Примітка |
|---|---|---|---|---|
| AAC | ✅ | ✅ | ✅ | |
| AC3 | ✅ | ✅ | ❌ | |
| E-AC3 (DD+) | ✅ | ✅ | ❌ | |
| DTS | ❌ (не в списку) | ⚠️ (MKV; 23+) | ❌ | Потребує перевірки |
| DTS-HD | ❌ | ⚠️ (23+) | ❌ | |
| MP3 | ✅ | ✅ | ✅ | |
| FLAC | ❌ (не в списку) | ✅ (2 канали) | ✅ | |
| Opus | ✅ | ⚠️ (25/26, MKV) | ✅ | |
| Vorbis | ✅ | ✅ (ogg) | ✅ | |
| PCM | ✅ | ✅ | ❌ | |

**Важливо:** «підтримка контейнера» ≠ «підтримка кожної комбінації кодеків». Реальна сумісність залежить від model group (Tizen) або версії webOS і конкретної моделі; таблиці вище — це максимум, а не гарантія для кожної пари «файл → пристрій».

---

## 6. Апаратне декодування

### 6.1. Чи можна використовувати HW-декодер без зовнішнього плеєра

**Так, але лише через платформні рушії:**
- **Tizen:** AVPlay — штатний пайплайн платформи, який і забезпечує 4K/8K. Це не «зовнішній плеєр»: відео рендериться в `<object type="application/avplayer">` всередині нашого застосунку.
- **webOS:** HTML5 `<video>` виводить відео на окрему апаратну площину (підтверджено відповіддю LG-інженера про прозорість області відео).

### 6.2. Чи можна зберегти низьке навантаження на CPU

Так — саме тому FFmpeg.wasm відкидається: програмне декодування 1080p/4K на TV-чіпі неприйнятне. Платформні рушії декодують апаратно.

### 6.3. 4K, HEVC, HDR

- **Tizen:** 4K — лише AVPlay (MSE ≤ FHD). Для 4K-режиму — `setStreamingProperty('SET_MODE_4K','TRUE')`; HDR обробляється платформою за метаданими потоку, публічного web-API для HDR-метаданих не знайдено.
- **webOS:** 4K/8K — за таблицями версій; HDR/Dolby Vision/Atmos — через `deviceInfo`; графіка застосунку обмежена 1080p на UHD-моделях.

### 6.4. Чого не можна

- Не можна підключити власний відеодекодер (libVLC/FFmpeg) до апаратного декодера TV: платформа не дає такого API (єдиний виняток — Tizen WASM Player, який приймає **вже демультиплексовані** пакети й декодує їх платформеним пайплайном).
- Не можна розраховувати на HDR-метадані в JS — їх немає у публічному API (не підтверджено).

---

## 7. Аудіодоріжки та субтитри

### 7.1. Перемикання аудіодоріжок

| Платформа | Механізм | Статус |
|---|---|---|
| Tizen AVPlay | `getTotalTrackInfo()` + `setSelectTrack('AUDIO', i)` у PLAYING/PAUSED | ✅ документовано |
| webOS | `video.audioTracks[i].enabled` (за твердженням LG) або Luna `com.webos.media.selectTrack` з `video.mediaId` | ⚠️ частково, офіційно не задокументовано |
| Desktop Chrome | `audioTracks` за прапорцем; практично недоступно | ❌ |
| HLS (усі) | `hls.audioTracks` + `hls.audioTrack` | ✅ |
| MKV/MP4 progressive | залежить від платформи; на ПК — ні | ⚠️ |

### 7.2. Субтитри

| Тип | Tizen AVPlay | webOS | Desktop |
|---|---|---|---|
| Внутрішні (MKV) | `setSelectTrack('TEXT', i)` ✅ | ❌ (офіційно ні) | ❌ |
| Зовнішні SRT | лише локальний шлях (SMI/TTML) ⚠️ | конвертація у VTT | конвертація у VTT |
| Зовнішні VTT | `<track>`/локальний шлях | `<track>` ✅ | `<track>` ✅ |
| ASS/SSA | ❌ | ❌ | ❌ (потрібен власний рендерер) |
| Зсув субтитрів | `setSubtitlePosition(ms)` ✅ | власний рендерер | власний рендерер |

**Рекомендація:** власний DOM-рендерер субтитрів (SRT/VTT → cues) як єдиний механізм на всіх платформах; внутрішні субтитри на Tizen — через AVPlay, якщо потрібна синхронізація з відеоплощиною.

---

## 8. Інтеграція з Lampa

### 8.1. Чи існує штатна реєстрація альтернативного плеєра

**Ні.** У поточній версії `Lampa.Player` експортує: `init, listener, toggle, play, playlist, render, subtitles, runas, callback, opened, iptv, programReady, close, getUrlQuality, loading, timecodeRecording, playdata`. Методу `register` немає (перевірено в [player.js](https://raw.githubusercontent.com/yumata/lampa-source/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/interaction/player.js)).

Є:
- `Player.runas(name)` і `data.launch_player` — примусовий вибір гілки;
- `Storage.player` / `player_torrent` / `player_iptv` — збережений вибір;
- `Player.listener` — події `create`, `start`, `ready`, `destroy`, `external`;
- `PlayerVideo.registerTube()` — реєстрація провайдера відео (YouTube), не плеєра.

### 8.2. Як формується меню вибору плеєра

Шаблон `src/templates/settings/player.js` містить три `select`-рядки:

```html
<div class="settings-param selector is--player" data-type="select" data-name="player">
<div class="settings-param selector is--player" data-type="select" data-name="player_iptv">
<div class="settings-param selector is--player" data-type="select" data-name="player_torrent">
```

Значення задаються у `src/interaction/settings/params.js` під час `Params.init()` залежно від платформи:

| Платформа | `player` / `player_iptv` / `player_torrent` (default) |
|---|---|
| Tizen | `tizen` / `tizen` / `tizen` |
| webOS | `inner` / `inner` / `inner` |
| Android (Lampa APK) | `android` / `android` / `android` |
| Desktop (NW/Electron) | `inner` / `inner` / `inner` |
| Browser | `inner` / `inner` / `inner` |

Рендеринг: `Component('player')` → `Template.get('settings_player')` → `Params.bind(...)`, який будує список опцій із `Params.values[name]` **у момент відкриття екрана**. Тобто значення, додані плагіном після старту, потраплять у меню.

Обмеження: рядки з класом `is--player` видаляються, якщо `!Platform.any()`; на десктопному браузері (`platform = 'browser'`) вони **не показуються**. На Tizen/webOS/Android — показуються.

### 8.3. Як додати «Наш VLC Player» у меню

Два підходи (обидва без зміни файлів Lampa):

**A. Розширити `Params.values` (мінімальний):**
```js
var values = Object.assign({}, Lampa.Params.values.player, { vlc: 'VLC Player' });
Lampa.Params.select('player', values, Lampa.Params.defaults.player);
// аналогічно player_torrent, player_iptv
```
Робити це після `app:ready` (бо `Params.init()` виконується під час старту застосунку, а плагіни завантажуються раніше). Після цього у штатному меню Lampa з’явиться пункт «VLC Player», а `Storage.field('player')` повертатиме `'vlc'`.

**B. Офіційний `Lampa.SettingsApi` (для ПК і додаткових налаштувань):**
```js
Lampa.SettingsApi.addComponent({ component: 'vlc', name: 'VLC Player', icon: '...' });
Lampa.SettingsApi.addParam({
    component: 'vlc',
    param: { name: 'vlc_engine', type: 'select', values: { auto: 'Авто', html5: 'HTML5', avplay: 'AVPlay' }, default: 'auto' },
    field: { name: 'Рушій', description: '…' }
});
```
`SettingsApi.addParam` для `type:'select'` сам викликає `Params.select(...)`, тому цим способом можна і додати опцію `vlc` до існуючих параметрів (передавши об’єднаний список), і створити власний розділ налаштувань.

### 8.4. Як Lampa зберігає вибір

`Storage.set('player', value)` у `localStorage` (ключі `player`, `player_torrent`, `player_iptv`). Читання — `Lampa.Storage.field('player')`. Синхронізація з акаунтом CUB для цих ключів не підтверджена.

### 8.5. Перехоплення запуску

- **Звичайне відео і торенти:** `Lampa.Player.listener.follow('create', e => { … e.abort(); Session.open(e.data) })` — єдина точка до створення плеєра. Плагін має перевірити, що `Storage.field('player'|'player_torrent') === 'vlc'`, інакше не втручатися.
- **Примусове блокування зовнішніх плеєрів:** `data.launch_player = 'lampa'` — гарантує внутрішню гілку (`start()` перевіряє це першим).
- **TorrServer:** `data.url` містить `&preload`; перед відтворенням застосувати `Lampa.Torserver.toPlayUrl(url)` → `&play`. Дані: `torrent_hash`, `id`, `card`, `ffprobe`, `subtitles`, `playlist`, `timeline`, `viewed`.
- **IPTV:** `Player.iptv(data)` **не надсилає `create`** (перевірено кодом `player.js`). Варіанти: (а) обгорнути `Lampa.Player.iptv` своєю функцією, яка запускає нашу сесію; (б) підписатися на `Lampa.PlayerIPTV.listener` (`play`, `channel`) і перехоплювати після `TV.start`, але це вже після створення штатного плеєра; (в) не підтримувати IPTV на цьому етапі. Рекомендовано (а), з повторним використанням `Lampa.PlayerIPTV` для логіки каналів.

### 8.6. URL, заголовки, метадані

- Lampa передає URL у `data.url`; окремих HTTP-заголовків у контракті `play(data)` немає.
- `<video src>` не дозволяє додавати заголовки; для HLS можна використати `hls.js` з `xhrSetup`, для AVPlay — ні (лише `open(url)`), для webOS — ні.
- Отже підтримка кастомних заголовків можлива лише для HLS/ПК і не є вимогою для TorrServer (CORS відкритий).

### 8.7. Закриття та повернення

Після `abort()` не можна викликати `Lampa.Player.close()` (штатний `work` не ініціалізований → `TypeError`). Правильно: зберегти `Lampa.Controller.enabled().name` до перехоплення і на закритті виконати `Lampa.Controller.toggle(prevName)`, попередньо прибравши свій DOM і повернувши `overflow`/тему.

---

## 9. Рекомендована архітектура

### 9.1. Принцип

**Один UI — кілька рушіїв.** VLC-подібний інтерфейс не знає, що під ним: AVPlay, `<video>` чи hls.js. Кожен рушій реалізує однаковий інтерфейс.

```
┌───────────────────────────────────────────────┐
│                Lampa VLC Player               │
│  ┌─────────────────────────────────────────┐  │
│  │ UI: overlay, panel, settings, subtitles │  │
│  └─────────────────────────────────────────┘  │
│  ┌───────────┐ ┌───────────┐ ┌────────────┐  │
│  │ Session   │ │ Tracks    │ │ Timeline   │  │
│  └───────────┘ └───────────┘ └────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │           Engine interface              │  │
│  └─────────────────────────────────────────┘  │
│   ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│   │ HTML5    │ │ AVPlay   │ │ webOS HTML5 │  │
│   │ (+hls.js)│ │ (Tizen)  │ │ (+Luna)     │  │
│   └──────────┘ └──────────┘ └─────────────┘  │
└───────────────────────────────────────────────┘
```

### 9.2. Інтерфейс рушія

| Метод / властивість | Призначення |
|---|---|
| `mount(container)` | створити `<video>` або `<object type="application/avplayer">` |
| `load(url, meta)` | відкрити джерело |
| `play() / pause() / toggle()` | транспорт |
| `seek(t) / seekBy(d)` | перемотка |
| `setRate(r)` | швидкість |
| `time() / duration() / buffered()` | прогрес |
| `videoSize()` | роздільність |
| `audioTracks() / selectAudio(i)` | доріжки |
| `subtitleTracks() / selectSub(i)` | субтитри |
| `setSubtitleDelay(ms)` | зсув |
| `destroy()` | звільнення |

### 9.3. Вибір рушія

| Платформа / умова | Рушій |
|---|---|
| Tizen + `webapis.avplay` доступний | **AVPlay** (основний) |
| Tizen без `webapis` (браузер) | HTML5 + hls.js (обмежено, до FHD) |
| webOS | HTML5 (+ Luna для доріжок, якщо доступний `mediaId`) |
| Desktop | HTML5 + hls.js (+ dash.js) |
| Невідома платформа | HTML5 |

### 9.4. Структура файлів (пропозиція)

```
Lampa-VLC-Player.js        — точка входу, інтерцептор, меню, сесія
engines/
  base.js                  — контракт рушія
  html5.js                 — <video> + hls.js/dash.js
  tizen-avplay.js          — AVPlay-адаптер
  webos.js                 — HTML5 + Luna-доріжки
ui/
  overlay.js               — повноекранний контейнер
  panel.js                 — VLC-панель
  subtitles.js             — DOM-рендерер SRT/VTT
  settings.js              — налаштування
core/
  interceptor.js           — create/abort, launch_player
  session.js               — життєвий цикл, контролер, timeline
  menu.js                  — інтеграція Params/SettingsApi
  remote.js                — Keypad/клавіатура
```

На етапі 3 файли не створюються — це цільова структура.

### 9.5. Потік

```
Lampa.Player.play(data)
  └─ create → interceptor:
        if Storage.field(key) === 'vlc':
            data.launch_player = 'lampa'
            e.abort()
            Session.open(data)
              ├─ EngineFactory.create(platform)
              ├─ UI.render()
              ├─ Controller.add('vlc_player')
              └─ Engine.load(Torserver.toPlayUrl(data.url))
```

---

## 10. Технічні обмеження та ризики

| № | Ризик | Ймовірність | Вплив | Пом'якшення |
|---|---|---|---|---|
| 1 | Lampa запущена в браузері TV, а не як застосунок → `webapis`/Luna недоступні | Висока | Високий | Визначити спосіб запуску; fallback HTML5; інструкція для користувача |
| 2 | AVPlay не грає конкретний MKV/TorrServer-потік | Середня | Високий | Тест на пристроях; fallback на HTML5; діагностика |
| 3 | Перемикання аудіодоріжок на webOS не працює | Висока | Середній | Luna `selectTrack` + `mediaId`; інакше — повідомлення |
| 4 | Вбудовані субтитри на webOS недоступні | Висока | Середній | DOM-рендерер; TorrServer `/subs` (WebVTT) |
| 5 | Напівпрозорі оверлеї на webOS дають артефакти | Висока | Середній | Непрозора панель, окремий шар |
| 6 | 4K/HDR — лише AVPlay; на HTML5 неможливо | Висока | Високий | AVPlay-рушій як основний на Tizen |
| 7 | DTS/FLAC/TrueHD не підтверджені на Tizen | Середня | Середній | Тест; транскодування на сервері за потреби |
| 8 | IPTV не перехоплюється через `create` | Висока | Середній | Обгортка `Player.iptv`, окремий етап |
| 9 | Оновлення Lampa змінюють `create`/`Params` | Середня | Високий | Feature-detection, тести після релізів |
| 10 | Ліцензії кодеків (Dolby/DTS) залежать від моделі | Середня | Середній | Не обіцяти підтримку; перевіряти на пристрої |
| 11 | Немає офіційної документації на `selectTrack`/`mediaId` | Висока | Середній | Ізолювати в адаптері; fallback |
| 12 | Складність Tizen WASM Player | Висока | Низький (не критично) | Не використовувати на перших етапах |

---

## 11. План подальшої розробки

| Етап | Зміст | Результат |
|---|---|---|
| **4.1** | Меню: `Params.select` + `SettingsApi`, збереження вибору, перевірка в інтерцепторі | Користувач бачить «VLC Player» у трьох меню; вибір зберігається |
| **4.2** | Абстракція рушія + рефакторинг поточного HTML5-плеєра під неї | Один UI, рушій змінний |
| **4.3** | Tizen AVPlay-рушій: `open/prepareAsync/play`, `setDisplayRect`, `setDisplayMethod`, seek, pause, destroy | Відтворення MKV/HEVC/4K на Tizen |
| **4.4** | Дорожки і субтитри: AVPlay `getTotalTrackInfo/setSelectTrack`, DOM-рендерер SRT/VTT | Перемикання доріжок, субтитри |
| **4.5** | webOS-рушій: HTML5 + `audioTracks`/Luna `selectTrack`, непрозора панель | Відтворення на webOS |
| **4.6** | IPTV: обгортка `Player.iptv`, мінімальна логіка каналів | IPTV у нашому плеєрі (за можливості) |
| **4.7** | Тестування на реальних Tizen/webOS, матриця форматів | Звіт сумісності |

---

## 12. Джерела

**Lampa (код):**
- `src/app.js` — `window.Lampa`, `app:ready`
- `src/interaction/player.js` — `play()`, `create`/`abort`, `start()`, `runas`, `iptv()`
- `src/interaction/player/video.js` — `<video>`, HLS/DASH
- `src/interaction/player/video/tizen.js` — AVPlay-обгортка Lampa
- `src/interaction/player/video/webos/parser.js` — Luna `com.webos.media`, `selectTrack`, `mediaId`
- `src/interaction/settings/params.js` — `values`, `select`, `bind`, `defaults`
- `src/interaction/settings/component.js` — `Params.bind`, `Api.getParam`
- `src/interaction/settings/api.js` — `addComponent`, `addParam`
- `src/templates/settings/player.js` — три `select`-рядки
- `src/interaction/torrent.js`, `src/interaction/torserver.js` — торент-потік
- `src/core/platform.js` — визначення платформи, `registerKey`

**Samsung:**
- [AVPlay API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html)
- [Using AVPlay](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html)
- [Using Video Elements](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-video-elements.html)
- [Subtitles](https://developer.samsung.com/smarttv/develop/guides/multimedia/subtitles.html)
- [Adaptive Streaming](https://developer.samsung.com/smarttv/develop/guides/multimedia/adaptive-streaming.html)
- [4K 8K UHD Video](https://developer.samsung.com/smarttv/develop/guides/multimedia/4k-8k-uhd-video.html)
- [2024 TV Video Specifications](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2024-tv-video-specifications.html)
- [2018 TV Video Specifications](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2018-tv-video-specifications.html)
- [Tizen WASM Player Features](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/tizen-wasm-player/tizen-wasm-player-features.html)
- [Initializing WASM Player](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/tizen-wasm-player/using-tizen-wasm-player/initializing-wasm-player.html)
- [General Specifications](https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html)

**LG:**
- [Web API and Web Engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)
- [Streaming Protocol and DRM](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm)
- [Video & Audio Format 6.0](https://webostv.developer.lge.com/develop/specifications/video-audio-60)
- [Video & Audio Format 4.0](https://webostv.developer.lge.com/develop/specifications/video-audio-40)
- [Video & Audio Format 22](https://webostv.developer.lge.com/develop/specifications/video-audio-220)
- [Video & Audio Format 23](https://webostv.developer.lge.com/develop/specifications/video-audio-230)
- [mediaOption parameter](https://webostv.developer.lge.com/develop/guides/mediaoption-parameter)
- [App Resolution](https://webostv.developer.lge.com/develop/specifications/app-resolution)
- [webOSTV.js](https://webostv.developer.lge.com/develop/references/webostvjs-webos)
- [Native media player (форум)](https://forum.webostv.developer.lge.com/t/native-media-player/10363)
- [C/C++ на webOS TV (форум)](https://forum.webostv.developer.lge.com/t/cant-use-c-or-c-on-webos-tv/3419)
- [audioTracks (форум)](https://forum.webostv.developer.lge.com/t/video-multi-audio/24156)
- [Субтитри (форум)](https://forum.webostv.developer.lge.com/t/subtitles-and-native-player/27908)
- [Прозорість відеошару (форум)](https://forum.webostv.developer.lge.com/t/alpha-blending-of-canvas-on-top-of-video-looks-wrong/28222)

**VideoLAN / FFmpeg:**
- [libVLC](https://www.videolan.org/vlc/libvlc.html)
- [VideoLAN Legal](https://www.videolan.org/legal.html)
- [VLC-Tizen (GitLab API)](https://code.videolan.org/videolan/vlc-tizen) — мобільний порт, C/EFL
- [vlc.js (експериментальний WASM-порт)](https://github.com/RichardAH/vlcjs)
- [Tessel «VLC TV»: чому web app, а не native libVLC](https://raw.githubusercontent.com/PatrickSt1991/tessel-tizen-tv/main/docs/WHY-WEB-APP.md)
- [ffmpeg.wasm Overview](https://ffmpegwasm.netlify.app/docs/overview)
- [ffmpeg.wasm Performance](https://ffmpegwasm.netlify.app/docs/performance)
- [ffmpeg.wasm FAQ (2 GB ліміт, відсутність сокетів)](https://ffmpegwasm.netlify.app/docs/faq)
- [FFmpeg Legal](https://www.ffmpeg.org/legal.html)
- [MDN WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), [caniuse WebCodecs](https://caniuse.com/webcodecs)

**Інше:**
- [MDN: HTMLMediaElement.audioTracks](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks)
- [webOS OSE: com.webos.media](https://www.webosose.org/docs/reference/ls2-api/com-webos-media/)
- [LG: Web App Types](https://webostv.developer.lge.com/develop/getting-started/web-app-types)

---

## 13. Відповідь на головне питання

**Яким способом найкраще розробити наш плеєр, щоб він працював всередині Lampa на Samsung Tizen і LG webOS, мав власний VLC-подібний інтерфейс, підтримував максимальну кількість відео- та аудіоформатів, перемикання доріжок і використовував апаратне декодування телевізора без запуску зовнішніх програм?**

**Відповідь:**

1. **Не вбудовувати libVLC і не використовувати FFmpeg.wasm.** libVLC — нативна C-бібліотека, недоступна у вебзастосунку; її єдиний «Tizen-порт» — мобільний застосунок для телефонів, а не TV, і не бібліотека для JS. Показово, що навіть повний нативний порт libVLC під Tizen 5.0 ARM «built cleanly, installed cleanly, but never launched on the retail TV». `vlc.js` — експеримент, який ще не готовий. FFmpeg.wasm дає 0.04–0.08× нативної швидкості та не має апаратного декодування — для TV це непридатно.

2. **Побудувати гібридний плеєр з єдиним UI та двома платформними рушіями:**
   - **Samsung Tizen — AVPlay** (`<object type="application/avplayer">`, `webapis.avplay`). Це єдиний шлях до 4K/HEVC/HDR, MKV/TS, аудіодоріжок і внутрішніх субтитрів на Tizen; відео рендериться в нашому застосунку, без зовнішніх програм.
   - **LG webOS — HTML5 `<video>`** (апаратна відеоплощина) + **HLS** (нативно або `hls.js`) + **Luna `com.webos.media.selectTrack`** для доріжок, якщо `audioTracks` недоступний.
   - **ПК — HTML5 + hls.js** (поточний прототип) як середовище розробки.

3. **Спільний UI**: один VLC-подібний overlay, одна панель, одні налаштування; субтитри — власний DOM-рендерер (SRT→VTT/ASS-підмножина), бо платформи не дають єдиного механізму.

4. **Меню Lampa**: додати `vlc` у `player`, `player_torrent`, `player_iptv` через `Lampa.Params.select(...)` після `app:ready` (або `Lampa.SettingsApi.addParam`), а в інтерцепторі `create` перевіряти збережений вибір; для блокування зовнішніх плеєрів — `data.launch_player = 'lampa'`.

5. **Обмеження, які треба прийняти:**
   - На Tizen поза Tizen-застосунком (у браузері) AVPlay може бути недоступним → HTML5-режим буде обмежений FHD.
   - webOS офіційно підтримує лише зовнішні WebVTT; вбудовані субтитри — через власний рендерер.
   - webOS не має офіційного API вибору доріжок — лише `audioTracks`/Luna (недокументовано).
   - DTS/FLAC/TrueHD на Tizen не підтверджені; частина форматів потребуватиме транскодування на сервері (TorrServer).
   - IPTV потребує окремої обгортки `Player.iptv` (немає `create`).

6. **Не використовувати Tizen WASM Player на цьому етапі:** він вимагає власного демуксера (FFmpeg у WASM) і C++/WASM-модуля; це окремий великий проєкт, який не дає переваг над AVPlay для типових форматів. **WebCodecs** варто перевірити окремим спайком ( `VideoDecoder.isConfigSupported()` на реальних TV) — це єдиний потенційний шлях до апаратного декодування з власним рендерером, але він потребує демуксера й підтвердження підтримки.

**Підсумок:** найкращий шлях — **VLC-подібний UI + адаптери AVPlay (Tizen) і HTML5/Luna (webOS)**, з інтеграцією в меню Lampa через `Params`/`SettingsApi` і перехопленням `create` + `abort()`. Це дає максимально можливу підтримку форматів, апаратне декодування і перемикання доріжок у межах того, що реально дозволяють платформи, без запуску зовнішніх програм.

---

## Додаток. Що не підтверджено

1. Наявність `webapis.avplay` у Lampa, відкритій у вбудованому браузері Tizen (а не як застосунок).
2. Сумісність AVPlay із конкретними TorrServer-потоками (MKV, seek, доріжки) — потребує тесту на пристрої.
3. Підтримка DTS/DTS-HD/FLAC/TrueHD на Tizen (у специфікаціях не згадані).
4. Офіційна документація LG на `com.webos.media.selectTrack` і `video.mediaId`.
5. Стабільність `audioTracks` на webOS для різних контейнерів.
6. Підтримка MKV/HEVC у desktop Chrome (залежить від ОС).
7. Наявність HDR-метаданих у публічному web-API Samsung/LG.
8. Версії Tizen/моделі, на яких доступний Tizen WASM Player.
9. Синхронізація вибору плеєра (`player`) з акаунтом CUB.
10. Поведінка прозорих оверлеїв на конкретних моделях webOS.
11. Доступність WebCodecs (`VideoDecoder`) у WebView Tizen TV та в браузері LG webOS TV.
12. Можливість запуску сторонніх нативних бінарників на retail-телевізорах Samsung (за наявними даними — ні).
