# Lampa VLC Player

Незалежний HTML5-програвач для медіапорталу **Lampa** у стилі VLC.
Плагін перехоплює запуск відео, скасовує штатний плеєр Lampa та відкриває
власний повноекранний інтерфейс.

> Поточний статус: **Етап 4.3** — HTML5 + Samsung Tizen AVPlay через спільний
> ENGINE_CONTRACT, меню Lampa, Debug Panel, fallback AVPlay → HTML5.
> webOS, Android Intent, IPTV — наступні етапи.

---

## Файли

| Файл | Призначення |
|---|---|
| `Lampa-VLC-Player.js` | Плагін (один файл, IIFE, без зовнішніх залежностей) |
| `tests/harness.html` | Браузерний тест-стенд із імітацією Lampa (43 перевірки) |
| `tests/static-check.js` | Статична перевірка коду в Node (82 перевірки) |
| `tests/menu-unit.js` | Node-тест меню та гейта вибору плеєра (17 перевірок) |
| `tests/engine-unit.js` | Node-тест контракту Html5Engine (64 перевірки) |
| `tests/avplay-unit.js` | Node-тест TizenAvplayEngine із заглушкою webapis.avplay (47 перевірок) |
| `docs/ETAP-1-tech-report.md` | Технічне дослідження API Lampa (Етап 1) |
| `docs/ETAP-3-player-architecture-research.md` | Архітектурне дослідження Tizen/webOS (Етап 3) |
| `docs/ETAP-4.1-report.md` | Звіт Етапу 4.1 |
| `docs/ETAP-4.2-report.md` | Звіт Етапу 4.2 |
| `docs/ETAP-4.3-report.md` | Звіт Етапу 4.3 |

---

## Як підключити до Lampa

### Варіант A. Як звичайний плагін (рекомендовано для ПК)

1. Розмістіть `Lampa-VLC-Player.js` на будь-якому HTTP-сервері, доступному з браузера, наприклад:
   ```powershell
   # у папці проєкту
   npx http-server -p 8080 -c-1
   ```
   Або відкрийте Lampa через `file://` і додайте скрипт вручну (варіант B).
2. У Lampa: **Налаштування → Розширення → Плагіни → Додати**
3. Вкажіть URL: `http://localhost:8080/Lampa-VLC-Player.js`
4. Перезавантажте Lampa (F5).

### Варіант B. Ручна ін’єкція (для швидкого тесту)

Відкрийте Lampa, у консолі браузера (F12) виконайте:

```js
var s = document.createElement('script');
s.src = 'http://localhost:8080/Lampa-VLC-Player.js';
document.body.appendChild(s);
```

Плагін сам дочекається `window.appready` (якщо Lampa ще не готова) і підпишеться
на `Lampa.Player.listener` → `create`.

### Вимкнення без видалення

```js
Lampa.Storage.set('vlc_player_enabled', 'false');  // вимкнути
Lampa.Storage.set('vlc_player_enabled', 'true');   // увімкнути
```

або з консолі: `__lampaVlcPlayer.setEnabled(false)`.

---

## Вибір плеєра в Lampa

Після завантаження плагін додає пункт **VLC Player** у три налаштування:

- **Плеєр** (`player`) — звичайне відео;
- **Плеєр для торентів** (`player_torrent`) — потоки TorrServer;
- **Плеєр для IPTV** (`player_iptv`) — пункт є, але IPTV ще не перехоплюється
  (див. обмеження).

Налаштування: **Lampa → Налаштування → Плеєр**. Вибір зберігається у
`localStorage` Lampa і переживає перезапуск. Якщо вибрано будь-який інший
плеєр, плагін не втручається у відтворення.

Перевірити поточний вибір:

```js
Lampa.Storage.field('player')          // 'vlc' або інше
__lampaVlcPlayer.isVlcSelected({})     // true/false
```

---

## Керування

| Дія | Клавіша / елемент |
|---|---|
| Play / Pause | `Space`, клік по відео, кнопка ▶/⏸ |
| Назад 10 с | `←`, кнопка ⟲10 |
| Вперед 10 с | `→`, кнопка ⟳10 |
| Закрити плеєр | `Esc`, кнопка ✕ |
| Підтвердити кнопку | `Enter` (коли кнопка у фокусі), інакше Play/Pause |
| Позиція | клік або перетягування прогрес-бара |
| Налаштування | кнопка ⚙ (швидкість відтворення, інфо про джерело) |

Панель автоматично ховається через 3 секунди під час відтворення; з’являється
при русі миші або натисканні клавіші.

Клавіатура перехоплюється у фазі **capture** на `window`, тому штатна навігація
Lampa не отримує ці ж натискання, поки плеєр відкритий.

---

## Тестування

### 1. Статична перевірка (Node)

```powershell
node tests/static-check.js
```

Очікуваний результат: `SUMMARY passed=82 failed=0`.

### 2. Unit-тест меню та гейта (Node)

```powershell
node tests/menu-unit.js
```

Очікуваний результат: `SUMMARY passed=17 failed=0`.
Перевіряє додавання опції `vlc` у три налаштування, відсутність дублікатів,
збереження `default` і правильність вибору джерела (`player` / `player_torrent`).

### 3. Unit-тест контракту рушія (Node)

```powershell
node tests/engine-unit.js
```

Очікуваний результат: `SUMMARY passed=64 failed=0`.
Перевіряє `ENGINE_CONTRACT`, `Html5Engine` (mount/load/seek/rate/треки/події/destroy),
відсутність витоків обробників і ізоляцію двох екземплярів рушія.

### 4. Unit-тест Tizen AVPlay (Node)

```powershell
node tests/avplay-unit.js
```

Очікуваний результат: `SUMMARY passed=47 failed=0`.
Використовує керовану заглушку `webapis.avplay`: життєвий цикл
`open → prepareAsync → play`, pause/resume, seek, доріжки, події, помилки,
destroy, повторне створення, fallback на HTML5.

> Заглушка **не підтверджує** роботу на реальному Samsung TV — потрібен пристрій.

### 5. Браузерний тест-стенд

Відкрийте у Chrome/Opera:

```
tests/harness.html
```

Стенд імітує Lampa (`Lampa.Listener`, `Lampa.Params`, `Lampa.Player.listener`,
`Lampa.Controller`, `Lampa.Storage`, `Lampa.Torserver.toPlayUrl`,
`HTMLMediaElement.play/pause`) і виконує 43 перевірки: меню, гейт вибору,
перехоплення `create`, відсутність штатного плеєра, DOM, URL, Debug Panel,
метрики, Engine/Player Core, відсутність AVPlay у браузері, `Escape`,
повернення контролера, повторний запуск, помилку декодування.

### 6. Реальна перевірка в Lampa

1. Запустіть Lampa у Chrome.
2. Підключіть плагін (див. вище).
3. Відкрийте фільм → «Грати».
4. Очікувано: штатний плеєр не з’являється, відкривається VLC-панель.
5. `Esc` → повернення до картки.

---

## Архітектура (всередині одного файлу)

```
init            — очікування app ready, ін’єкція CSS, меню, підписка
interceptor     — 'create' → перевірка вибору → abort() → Session.open()
Player Core     — Session: життєвий цикл, контролер, таймлайн, body-lock
EngineFactory   — вибір рушія: tizen-avplay або html5 (fallback)
Html5Engine     — <video>: load/play/pause/seek/rate/треки/помилки/destroy
TizenAvplayEng. — <object type="application/avplayer"> + webapis.avplay
ui              — повноекранний контейнер + VLC-панель (DOM + CSS)
controls        — кнопки, прогрес-бар, налаштування
remote          — клавіатура (capture), заготовка під Lampa.Keypad
Debug Panel     — метрики через контракт рушія, журнал подій
```

**Контракт рушія** (`ENGINE_CONTRACT`): `mount`, `load`, `play`, `pause`,
`toggle`, `seek`, `setRate`, `time`, `duration`, `buffered`, `videoSize`,
`audioTracks`, `selectAudio`, `subtitleTracks`, `selectSubtitle`,
`setSubtitleDelay`, `destroy`. Плюс `name`, `capabilities()`, `seekBy()`,
`paused()`, `rate()`.

Player Core не звертається до `<video>`/AVPlay напряму: усе — через методи рушія.
`EngineFactory.platformId()` вибирає `tizen-avplay` лише коли
`Lampa.Platform.is('tizen')` **і** доступний `webapis.avplay` з потрібними методами;
інакше — `html5`. User-Agent не використовується.

При фатальній помилці AVPlay Player Core один раз перемикається на HTML5
(`fallbackUsed`), попередньо знищивши AVPlay-рушій.

`audioTracks()` повертає `null`, якщо браузер не реалізує API (Chromium),
`setSubtitleDelay()` в HTML5 повертає `false` — фіктивна підтримка не імітується.

---

## Відомі обмеження Етапу 4.3

- Лише прогресивний HTTP(S) (MP4/WebM). HLS/DASH поки не підключаються — нативний HLS є лише в Safari.
- MKV/HEVC/AC-3 залежать від браузера; у Chromium часто не відтворюються (буде показано помилку).
- Немає UI вибору аудіодоріжок і субтитрів: контракт рушія вже має `audioTracks`/`selectAudio`/`subtitleTracks`/`selectSubtitle`, але кнопок у панелі ще немає; `setSubtitleDelay` в HTML5 не підтримується (`false`).
- **IPTV:** пункт `player_iptv` додано в меню, але `Lampa.Player.iptv()` не надсилає подію `create`,
  тому перехоплення IPTV ще не реалізовано (потрібна обгортка `Player.iptv` — наступний етап).
- **Швидкість у Debug Panel** — оцінка наповнення буфера, а не бітрейт; позначена `ESTIMATED`.
- Панель діагностики увімкнена завжди під час розробки (`CONFIG.debugPanel`).
- Немає підтримки таймлайну Lampa у зворотному напрямку (відображення прогресу на картці одразу після закриття може потребувати перезавантаження екрана).
- Повноекранний режим — вікно браузера (Fullscreen API не використовується).
- Tizen/webOS/Android TV не тестувалися; ключові коди (10009, 461, 4/27) ще не підключені до `Lampa.Keypad`.
- **AVPlay** активний лише в Tizen-застосунку з `webapis.avplay`; у браузері TV використовується HTML5.
- **AVPlay не має buffered ranges** — Debug Panel показує `N/A` замість вигаданих секунд.
- `getTotalTrackInfo()` у READY після `prepareAsync()` може бути порожнім (Samsung документує READY лише для синхронного `prepare()`); вибір доріжок в UI ще не реалізовано.
- Відеоплощина AVPlay може не композитися з HTML-оверлеєм на частині моделей — видимість VLC-панелі над відео треба перевірити на реальному TV.

---

## Діагностика

У плеєрі є вбудована панель **VLC PLAYER DEBUG** (верхній лівий кут). Вона показує:

- стан (`INITIALIZING`, `LOADING`, `PLAYING`, `PAUSED`, `BUFFERING`, `ERROR`, `STOPPED`);
- тип джерела (`LINK`, `TorrServer`, `IPTV`, `UNKNOWN`);
- час, тривалість, роздільність (`N/A`, якщо недоступно);
- буфер — реальні секунди з `video.buffered` після поточної позиції;
- швидкість наповнення буфера — `≈N× (ESTIMATED)` (це не бітрейт і не швидкість мережі);
- рушій (`HTML5`);
- останню помилку (код + опис);
- журнал останніх 14 технічних подій.

Панель не перехоплює кліки (`pointer-events: none`) і видаляється разом із плеєром.
Вимкнути її можна в консолі: `__lampaVlcPlayer.config.debugPanel = false` (до відкриття плеєра).

Увімкніть логування, додавши `?vlcdebug=1` до URL Lampa, або:

```js
__lampaVlcPlayer.config.debug = true;
```

Корисні команди в консолі:

```js
__lampaVlcPlayer.isReady()    // плагін ініціалізовано
__lampaVlcPlayer.isOpen()     // плеєр відкритий
__lampaVlcPlayer.session()    // поточна сесія
__lampaVlcPlayer.close()      // примусово закрити
```
