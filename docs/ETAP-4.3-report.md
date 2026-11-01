# Звіт Етап 4.3 — Samsung Tizen AVPlay Engine

**Дата:** 01.11.2026
**Версія плагіна:** 0.5.0
**Статус:** адаптер AVPlay реалізовано; HTML5-шлях не змінено. На реальному телевізорі не перевірялося.

---

## 1. Які файли змінено

| Файл | Дія |
|---|---|
| `Lampa-VLC-Player.js` | змінено: `TizenAvplayEngine`, `isAvplayAvailable()`, вибір рушія, fallback AVPlay → HTML5, версія 0.5.0 |
| `tests/static-check.js` | змінено: +14 перевірок AVPlay (усього 82) |
| `tests/harness.html` | змінено: +2 перевірки (усього 43) |
| `tests/avplay-unit.js` | **створено**: 47 перевірок із заглушкою `webapis.avplay` |
| `README.md` | змінено: статус, архітектура, тести, обмеження |
| `docs/ETAP-4.3-report.md` | **створено** |

`Html5Engine`, стандартний плеєр Lampa, меню та Debug Panel не переписувалися. Комітів немає.

---

## 2. Як визначається Tizen

`EngineFactory.platformId()`:

```js
var tizen = !!(Platform && typeof Platform.is === 'function' && Platform.is('tizen'));
if (tizen && isAvplayAvailable()) return 'tizen-avplay';
return 'html5';
```

`isAvplayAvailable()` перевіряє `window.webapis.avplay` і наявність **реальних методів**:
`open`, `close`, `prepareAsync`, `play`, `pause`, `stop`, `seekTo`,
`getDuration`, `getCurrentTime`, `setListener`, `setDisplayRect`, `setSpeed`.

- User-Agent не використовується взагалі.
- У звичайному браузері (навіть з імітацією TV) `Platform.is('tizen')` не викликається
  без наявності `webapis.avplay`, тому AVPlay там не запускається.
- Методи доріжок (`getTotalTrackInfo`, `setSelectTrack`) — **не критичні**:
  перевіряються окремо (`hasAvplayTracks`), щоб старіші моделі могли відтворювати
  відео навіть без track API.

---

## 3. Як працює TizenAvplayEngine

`TizenAvplayEngine(hooks)` — окремий рушій, що реалізує `ENGINE_CONTRACT`.

### Життєвий цикл

1. `mount()` створює `<object type="application/avplayer" class="vlc-video vlc-avplay">`.
2. `load(url)`:
   - `closeInternal()` (stop/close попереднього стану),
   - `open(url)` → стан IDLE,
   - `setListener({...})`,
   - `setDisplayRect(0,0,1920,1080)` + `setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')`,
   - `prepareAsync(success, error)` → у success: `prepared = true`, `onMeta()`,
     `play()`, `onPlayState()`, `onPlaying()`.
3. `play()/pause()/toggle()` — лише у дозволених станах.
4. `seek(time)` — `seekTo(ms)` з clamp за `duration`.
5. `setRate(rate)` — `setSpeed`.
6. `destroy()` — `stop()` → `close()` → видалення `<object>` → `el = null`.

### Стани

`none → idle → preparing → ready → playing ↔ paused` (+ завершення → `ready`).
Методи, що вимагають READY/PLAYING/PAUSED, перевіряють стан і не викликаються
в неправильному стані.

### Помилки

| Код | Причина |
|---|---|
| 100 | немає `webapis.avplay` |
| 101 | `open()` |
| 102 | `prepareAsync()` |
| 103 | `play()` |
| 104 | `pause()` / `seekTo()` |
| 105 | `onerror` від AVPlay |
| 106 | `setListener()` |
| 110 | невдача fallback на HTML5 |

Кожна помилка передається в `hooks.onError(code, text, fatal)`; фатальні
обробляються fallback-механізмом.

### Захист від двох сесій

`webapis.avplay` — синглтон. Модульна змінна `avplayCurrent` знищує попередній
екземпляр перед створенням нового.

---

## 4. Відеоповерхня

- `<object type="application/avplayer">` монтується перед першим елементом UI,
  тому відео перебуває **під** VLC-панеллю.
- CSS: `.vlc-video` (absolute, 100%×100%), `.vlc-avplay` — `pointer-events:none`,
  прозорий фон (щоб HTML-кнопки отримували кліки).
- `setDisplayRect(0,0,1920,1080)` — Samsung завжди трактує координати як 1920×1080.
- На `resize` виклик `setDisplayRect` повторюється з debounce 200 мс.
- `destroy()` видаляє `<object>` і знімає resize-обробник.

**Обмеження відеошару:** AVPlay може рендеритися на окремій площині; на частині
моделей HTML-оверлей над відео не композититься. Це неможливо перевірити без
реального TV — див. розділ 9.

---

## 5. Як працює fallback

```js
if (fatal && canFallback(s)) fallbackToHtml5(s, text);
```

- `canFallback(s)` — лише якщо поточний рушій `Tizen AVPlay` і `fallbackUsed === false`.
- `fallbackToHtml5(s)`:
  1. ставить `fallbackUsed = true`;
  2. **знищує AVPlay-рушій** (`destroy()`), щоб два рушії не працювали одночасно;
  3. `EngineFactory.create(s.hooks, s, 'html5')` — примусово HTML5;
  4. монтує `<video>` у той самий контейнер, оновлює Debug Panel;
  5. `engine.load(s.url)`.

Якщо HTML5 теж не може запуститися — показується помилка в UI та Debug Panel
(код 110). Повторний fallback не виконується.

HTML5-помилки (`onError` без `fatal`) fallback не викликають.

---

## 6. Які методи контракту реалізовані

| Метод | AVPlay |
|---|---|
| `mount` | `<object type="application/avplayer">` |
| `load` | `open` → `setListener` → `prepareAsync` → `play` |
| `play` / `pause` / `toggle` | `play()` / `pause()` з перевіркою стану |
| `seek` / `seekBy` | `seekTo(ms)` |
| `setRate` | `setSpeed` |
| `time` / `duration` | `getCurrentTime()/getDuration()` → секунди |
| `buffered` | `0` (AVPlay не має buffered ranges → Debug Panel показує `N/A`) |
| `videoSize` | `getCurrentStreamInfo()` (кеш 2 с) |
| `audioTracks` / `selectAudio` | `getTotalTrackInfo()` / `setSelectTrack('AUDIO', i)` |
| `subtitleTracks` / `selectSubtitle` | `getTotalTrackInfo()` / `setSelectTrack('TEXT', i)` |
| `setSubtitleDelay` | `setSubtitlePosition(ms)` (лише PLAYING/PAUSED) |
| `destroy` | `stop()` → `close()` → DOM cleanup |
| `capabilities` | track API, subtitleDelay — за фактичною наявністю методів |

UI вибору дорожок/субтитрів на цьому етапі не додавався (за ТЗ).

---

## 7. Які обмеження залишилися

1. **Немає перевірки на реальному TV.** Заглушка `webapis.avplay` перевіряє лише логіку.
2. **Сумісність AVPlay з конкретними TorrServer-потоками** (MKV/HEVC/AC-3, seek) не підтверджена.
3. **HTML-оверлей над AVPlay** може бути невидимим на частині моделей — ризик для VLC-панелі.
4. **`buffered()` = 0** — Debug Panel показує `N/A`; це чесно, але менш інформативно, ніж HTML5.
5. **`getTotalTrackInfo()` у READY** після `prepareAsync()` може бути порожнім (Samsung документує READY лише для синхронного `prepare()`); UI дорожок ще немає.
6. **`setDisplayRect` завжди 1920×1080** — якщо застосунок Lampa має іншу роздільність, потрібне масштабування (зараз припускається повноекранний режим).
7. **Повторне відкриття** перевірене логічно (destroy → новий екземпляр), але не на пристрої.
8. **Панель діагностики** показує `ENGINE: Tizen AVPlay`; швидкість/буфер — `N/A`, бо AVPlay не дає цих метрик.

---

## 8. Результати всіх тестів

| Команда | Результат |
|---|---|
| `node --check Lampa-VLC-Player.js` | ✅ OK |
| `node tests/static-check.js` | ✅ **82/82 PASS** |
| `node tests/menu-unit.js` | ✅ **17/17 PASS** |
| `node tests/engine-unit.js` | ✅ **64/64 PASS** |
| `node tests/avplay-unit.js` | ✅ **47/47 PASS** |
| Парсинг скриптів `tests/harness.html` | ✅ OK |

`avplay-unit.js` перевіряє:

- визначення платформи (`Platform.is('tizen')` + `webapis.avplay`, без UA);
- відсутність AVPlay → `html5`;
- життєвий цикл `open → setListener → prepareAsync → play`;
- `pause`/`resume`/`toggle`, `seek(30) → seekTo(30000)`, `setSpeed`;
- `time`/`duration`, `buffered() === 0`;
- `audioTracks`/`selectAudio`, `subtitleTracks`/`selectSubtitle`, `setSubtitleDelay`;
- події `onbufferingstart/complete`, `oncurrentplaytime`, `onstreamcompleted`, `onerror`;
- `destroy` (stop/close/DOM cleanup);
- повторне створення сесії;
- `fallbackToHtml5` (заміна рушія, URL, монтування);
- відсутність track API → `capabilities().audioTracks === false`, `audioTracks() === null`.

**Не виконано:** `tests/harness.html` (43) — браузер не запускався; реальна Lampa,
Samsung TV, webOS, Android TV — не тестувалися.

> Заглушка AVPlay **не підтверджує** роботу на реальному Samsung TV.

---

## 9. Що обов’язково перевірити на реальному телевізорі

1. **Доступність `webapis.avplay`** у тому способі запуску Lampa, який використовує користувач (Tizen-віджет vs вбудований браузер).
2. **Видимість VLC-панелі над AVPlay-відео** (композитинг HTML-шару).
3. **Відтворення TorrServer-потоків**: MKV, HEVC, AC-3/E-AC-3, 4K.
4. **Seek** на прогресивному HTTP (Range) і коректність `getCurrentTime()`.
5. **Перемикання аудіодоріжок** через `setSelectTrack('AUDIO', i)` для реального MKV.
6. **Внутрішні субтитри** (`setSelectTrack('TEXT', i)`) і `setSubtitlePosition`.
7. **Поведінка `getTotalTrackInfo()`** після `prepareAsync()` (можливо, порожній список).
8. **Закриття та повторне відкриття** плеєра (stop/close, відсутність «завислого» відео).
9. **Fallback**: штучно зіпсувати URL → має перемкнутися HTML5 без подвійного відтворення.
10. **Кнопки пульта** (Back 10009, Play/Pause, стрілки) під час AVPlay-сесії.
11. **Продуктивність/нагрів** на 4K HEVC.
12. **Поведінка при виході з застосунку** (pause/resume, `webapis.avplay.suspend/restore` — не реалізовано).

---
