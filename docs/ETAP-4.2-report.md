# Звіт Етап 4.2 — Архітектура змінних відеорушіїв

**Дата:** 01.11.2026
**Версія плагіна:** 0.4.0
**Статус:** рефакторинг завершено; поведінка плеєра для користувача не змінилася.

---

## 1. Нова структура архітектури

```
Lampa (create)
   │
   ▼
Interceptor  ──►  Player Core (Session)
                     │  вибір через EngineFactory
                     ▼
              ┌───────────────────┐
              │   ENGINE_CONTRACT │
              └───────────────────┘
                     │
     ┌───────────────┼────────────────┐
     ▼               ▼                ▼
 Html5Engine    (майбутнє)        (майбутнє)
   <video>      TizenAvplayEngine  WebosEngine
```

- **ENGINE_CONTRACT** — масив із 17 методів, які зобов’язаний реалізувати кожен рушій:
  `mount, load, play, pause, toggle, seek, setRate, time, duration, buffered,
  videoSize, audioTracks, selectAudio, subtitleTracks, selectSubtitle,
  setSubtitleDelay, destroy`.
- Додатково рушій має `name`, `capabilities()`, `seekBy()`, `paused()`, `rate()`.
- **EngineFactory** — єдина точка вибору рушія (`engines = { html5: Html5Engine }`,
  `platformId()` зараз повертає `'html5'`).
- **Player Core (Session)** — життєвий цикл сесії: контролер Lampa, body-lock,
  Debug Panel, таймлайн, закриття. Не торкається `<video>` напряму.
- **UI / Controls / Remote / Menu** — не змінилися; працюють через Session і
  контракт рушія.

Ключова властивість: щоб додати AVPlay або webOS, достатньо додати новий об’єкт
у `EngineFactory.engines` і реалізувати контракт — UI, меню, Player Core і
Debug Panel залишаються без змін.

---

## 2. Які файли змінено та створено

| Файл | Дія |
|---|---|
| `Lampa-VLC-Player.js` | змінено: `Html5Engine`, `ENGINE_CONTRACT`, `EngineFactory`, Player Core через контракт; версія 0.4.0 |
| `tests/static-check.js` | змінено: +11 перевірок архітектури (усього 68) |
| `tests/harness.html` | змінено: +4 перевірки Engine/Player Core (усього 41) |
| `tests/engine-unit.js` | **створено**: 64 перевірки контракту рушія |
| `README.md` | змінено: архітектура, тести, обмеження |
| `docs/ETAP-4.2-report.md` | **створено** |

`docs/ETAP-1-tech-report.md`, `docs/ETAP-3-player-architecture-research.md`,
`docs/ETAP-4.1-report.md` не змінювалися. Стандартний плеєр Lampa не змінювався.
Комітів немає.

---

## 3. Як працює Html5Engine

`Html5Engine(hooks)` — фабрика, що створює `<video class="vlc-video">` і повертає
об’єкт рушія.

### Методи

| Метод | Реалізація |
|---|---|
| `mount(container, before)` | вставляє `<video>` перед вказаним вузлом (відео під UI-шаром) |
| `load(url)` | `data-src`, `src`, `load()`, `play()`; скасовує autoplay-помилку в `hooks.onAutoplayBlocked()` |
| `play()/pause()/toggle()` | керування `<video>` з обробкою Promise |
| `seek(time)` | clamp за `duration`, захист від від’ємних значень |
| `seekBy(delta)` | `seek(time() + delta)` |
| `setRate(rate)` | `video.playbackRate` |
| `time()/duration()/buffered()` | реальні значення `<video>` |
| `videoSize()` | `videoWidth` × `videoHeight` |
| `audioTracks()` | `null`, якщо `HTMLMediaElement.audioTracks` недоступний (Chromium); інакше масив доріжок |
| `selectAudio(i)` | `true` лише якщо доріжку реально перемкнено |
| `subtitleTracks()` | реальні `video.textTracks` (WebVTT); `[]`, якщо немає |
| `selectSubtitle(i)` | вмикає `showing`, інші — `disabled`; `false`, якщо доріжки немає |
| `setSubtitleDelay(v)` | `false` — HTML5 не має нативного зсуву |
| `capabilities()` | реальні прапорці: `audioTracks`, `subtitleTracks`, `subtitleDelay: false`, `rate`, `seek` |
| `destroy()` | pause → `removeAttribute('src'/'data-src')` → `load()` → зняття обробників → видалення з DOM → `el = null` |

### Події

`loadedmetadata`, `durationchange` → `onMeta`; `timeupdate` → `onTime`;
`progress` → `onProgress`; `playing` → `onPlaying`; `play`/`pause` → `onPlayState`;
`waiting`/`stalled`/`seeking` → `onWaiting(true)`; `canplay`/`seeked` →
`onWaiting(false)`; `ended` → `onEnded`; `ratechange` → `onRate`; `error` →
`onError` (з автоповтором для `code 2`, як і раніше).

---

## 4. Як Player Core взаємодіє з рушієм

1. `Session.open(data, url, prevController)` створює сесію та UI.
2. `EngineFactory.create(hooks, session)` повертає рушій (`Html5Engine`).
3. `engine.mount(root, root.firstChild)` монтує відео під UI.
4. `engine.load(url)` запускає відтворення.
5. Усі дії (play/pause/seek/rate/retry/закриття) виконуються через методи рушія.
6. Debug Panel отримує `engine.name` і метрики через `engine.time()/duration()/buffered()/videoSize()`.
7. `Session.close()` викликає `engine.destroy()` і звільняє сесію.

Player Core більше не містить `s.engine.el` — це перевіряється статичним тестом
(`Player Core не звертається до engine.el`). Реконнект (`retry`) теж переписаний
на `engine.load()` + `engine.seek()`, без прямого доступу до `<video>`.

---

## 5. Як передаються дані в Debug Panel

- `s.debug = createDebugPanel(s.ui.refs.debug)` — створюється разом із сесією.
- `dbg(s, 'setEngine', s.engine.name)` — ім’я рушія береться з контракту
  (`engine.name`), а не з константи.
- `refreshDebug(s)` читає лише контракт: `time()`, `duration()`, `buffered()`,
  `videoSize()`, `paused()`.
- Стани й події передаються з хуків рушія (`onPlaying`, `onWaiting`, `onError`…)
  через `setDebugState`, `dbg(s,'event', …)`, `dbg(s,'setError', …)`.
- Для майбутніх рушіїв достатньо повертати ті самі методи контракту; панель
  покаже їхні реальні значення без змін коду панелі.
- Якщо рушій не підтримує параметр — повертає `null`/`false`, і панель показує
  `N/A` або порожній список; фіктивні значення не підставляються.

---

## 6. Які методи поки не підтримуються

| Метод | Стан |
|---|---|
| `audioTracks()` | У Chromium `HTMLMediaElement.audioTracks` відсутній → `null`. Працює лише там, де браузер реалізує API (Safari). |
| `selectAudio()` | `false`, якщо доріжок немає або API недоступне. |
| `subtitleTracks()` | Реальні `textTracks`; поки UI не додає `<track>`, тому зазвичай `[]`. |
| `selectSubtitle()` | Працює з наявними `textTracks`, але завантаження субтитрів у плеєрі ще не реалізовано. |
| `setSubtitleDelay()` | `false` — нативного зсуву в HTML5 немає. |
| UI вибору дорожок/субтитрів | Відсутній (наступні етапи). |

Це не «заглушки»: методи повертають реальний стан API, а не імітують роботу.

---

## 7. Результати тестування

| Команда | Результат |
|---|---|
| `node --check Lampa-VLC-Player.js` | ✅ синтаксис OK |
| `node tests/static-check.js` | ✅ **68/68 PASS** |
| `node tests/menu-unit.js` | ✅ **17/17 PASS** |
| `node tests/engine-unit.js` | ✅ **64/64 PASS** |
| Парсинг скриптів `tests/harness.html` | ✅ 2/2 OK |

`engine-unit.js` перевіряє:

- наявність усіх 17 методів контракту;
- `mount` (вставка перед вузлом), `load` (`src`, `data-src`, `load()`, autoplay);
- `play/pause/toggle`, `seek` (clamp), `seekBy`, `setRate`;
- `time/duration/buffered/videoSize`;
- `audioTracks` (`null` без API, 2 доріжки з API, перемикання, невірний індекс → `false`);
- `subtitleTracks`/`selectSubtitle` (реальні `textTracks`, невірний індекс → `false`);
- `setSubtitleDelay` → `false`;
- події `loadedmetadata/timeupdate/progress/error`;
- `destroy`: очищення `src`/`data-src`, `load()`, видалення з DOM, зняття всіх обробників, `el = null`;
- ізоляцію двох екземплярів рушія (події одного не впливають на інший).

**Не виконано:** `tests/harness.html` (41 перевірка) — браузер у середовищі не
запускався; реальна Lampa, Tizen, webOS, Android TV — не тестувалися.

---

## 8. Ризики, що залишилися

1. **Поведінка HTML5 залежить від браузера**: `audioTracks`/`textTracks` працюють
   по-різному; контракт це відображає, але UI поки не використовує.
2. **Контракт не версіонований**: майбутні рушії повинні повертати ті самі типи
   (`null`/`false`/масиви), інакше Debug Panel і Core можуть показати некоректні дані.
3. **`seek` до завантаження метаданих** може бути проігнорований браузером —
   реконнект із позицією потребує перевірки на реальних потоках.
4. **Автоповтор** (`code 2`) залишився всередині Html5Engine; для AVPlay/webOS
   його треба буде реалізувати в їхніх адаптерах.
5. **Немає тестів на пристроях** — уся перевірка логічна/статична.

---

## 9. Рекомендації щодо Samsung AVPlay (наступний етап)

1. **Окремий файл/модуль** `TizenAvplayEngine` у `EngineFactory.engines['tizen-avplay']`.
2. `platformId()`: `Lampa.Platform.is('tizen') && typeof webapis !== 'undefined' &&
   typeof webapis.avplay !== 'undefined'` → `'tizen-avplay'`; інакше `'html5'`.
3. **mount**: створити `<object type="application/avplayer">` у тому ж контейнері
   (перед UI-шаром), `setDisplayRect(0, 0, 1920, 1080)`.
4. **load(url)**: `open(url)` → `setListener(...)` → `prepareAsync()` → `play()`;
   події `onbufferingstart/progress/complete`, `oncurrentplaytime`,
   `onstreamcompleted`, `onerror` мапляться на ті самі hooks.
5. **time/duration**: `getCurrentTime()/1000`, `getDuration()/1000`.
6. **seek**: `seekTo(ms)`; **setRate**: `setSpeed`.
7. **audioTracks**: `getTotalTrackInfo()` → `{index, extra_info}`;
   `selectAudio(i)` → `setSelectTrack('AUDIO', i)` (у PLAYING/PAUSED, бо READY
   для прогресивного HTTP не працює).
8. **subtitleTracks/selectSubtitle**: `setSelectTrack('TEXT', i)` для внутрішніх;
   зовнішні SRT — окремий DOM-рендерер (AVPlay приймає лише локальний шлях).
9. **destroy**: `stop()` → `close()` → видалити `<object>`; зняти listener.
10. **Fallback**: якщо `webapis` немає (Lampa у браузері TV) — `EngineFactory`
    повертає `html5`; UI і Debug Panel не змінюються.
11. **Тести**: Node-адаптер із фейковим `webapis.avplay` (як `engine-unit.js`) +
    перевірка мапінгу подій; реальний пристрій — обов’язковий.

---
