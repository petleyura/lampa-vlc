# Звіт Етап 4.1 — Інтеграція VLC Player та технічна панель діагностики

**Дата:** 01.11.2026
**Версія плагіна:** 0.3.0
**Статус:** реалізовано; автоматичні Node-перевірки пройдено; браузерний стенд і реальні пристрої не запускалися.

---

## 1. Які файли змінено

| Файл | Дія | Що змінено |
|---|---|---|
| `Lampa-VLC-Player.js` | змінено | меню Lampa, гейт вибору, Debug Panel, телеметрія, версія 0.3.0 |
| `tests/static-check.js` | змінено | +20 перевірок (меню, гейт, панель) — усього 57 |
| `tests/harness.html` | змінено | заглушки `Lampa.Params`/`Storage.field`, 37 перевірок замість 22 |
| `tests/menu-unit.js` | **створено** | Node-тест меню та гейта (17 перевірок) |
| `README.md` | змінено | розділи «Вибір плеєра», Debug Panel, нові команди тестів |
| `docs/ETAP-4.1-report.md` | **створено** | цей звіт |

Файли `docs/ETAP-1-tech-report.md` і `docs/ETAP-3-player-architecture-research.md` не змінювалися. Стандартний плеєр Lampa не змінювався. Коміти не створювалися.

---

## 2. Які функції реалізовано

### 2.1. Меню налаштувань

- Новий модуль `Menu` (розділ 13 у файлі).
- Після `app:ready` (коли `Lampa.Params.init()` уже створив `values`/`defaults`) у три налаштування додається значення `vlc` з підписом `VLC Player`:
  - `player` — звичайне відео;
  - `player_torrent` — TorrServer;
  - `player_iptv` — IPTV (пункт є, перехоплення ще ні).
- Наявні опції зберігаються: поточний об’єкт копіюється, `vlc` додається в кінець.
- `default` не змінюється: у `Lampa.Params.select(key, merged, def)` передається **поточний** `Lampa.Params.defaults[key]`.
- Повторний виклик `Menu.apply()` нічого не дублює: перевірка `values[Menu.option] === Menu.label`.
- Fallback: якщо `Params.select` недоступний — опція додається напряму в `values`, `default` не чіпається.

### 2.2. ПК-розділ налаштувань

Lampa видаляє штатні рядки `.is--player`, якщо `Platform.any() === false` (десктопний браузер). Тому додатково створюється розділ **VLC Player** через офіційний `Lampa.SettingsApi`:

```js
SettingsApi.addComponent({ component: 'vlc_player', name: 'VLC Player', icon: ... });
SettingsApi.addParam({ component: 'vlc_player', param: { name: 'player', type: 'select', ... } });
```

Розділ створюється **лише** на платформах, де штатні рядки приховані (`!Platform.any()`), тому на Tizen/webOS/Android дублікатів немає.

### 2.3. Гейт перехоплення

- `sourceKey(data)` → `player_torrent` (є `torrent_hash`/`torrent`), `player_iptv` (`iptv`), інакше `player`.
- `isVlcSelected(data)` → `Lampa.Storage.field(key) === 'vlc'`.
- У `onPlayerCreate` перевірка стоїть **до** `abort()`: якщо VLC не вибрано — плагін не втручається, `data.launch_player` не змінюється, штатна поведінка Lampa повністю збережена.
- Якщо VLC вибрано — `data.launch_player = 'lampa'`, `abort()`, власна сесія.

### 2.4. Debug Panel

- Компактна панель у верхньому лівому куті (`top: 58px`, під верхньою смугою), напівпрозорий темний фон, моноширинний шрифт 10 px.
- `pointer-events: none` — не перехоплює кліки, не блокує керування, не впливає на розміри відео.
- Панель не має власних обробників клавіатури.
- Видаляється разом із сесією: `s.debug.dispose()` + видалення кореневого DOM.
- Усі виклики з боку сесії йдуть через `safe()`/`dbg()`; `refreshDebug()` має власний `try/catch`, тому помилка панелі не зупиняє відтворення.
- Панель увімкнена завжди під час розробки (`CONFIG.debugPanel = true`); вимикається через `__lampaVlcPlayer.config.debugPanel = false` до відкриття плеєра.

### 2.5. Телеметрія

- Стани: `INITIALIZING` → `LOADING` → `PLAYING`/`PAUSED`/`BUFFERING` → `ERROR`/`STOPPED`.
- Джерело: `LINK` / `TorrServer` / `IPTV` / `UNKNOWN` (за `torrent_hash`, `iptv`, `/stream/`, `/gst/`, `http(s)`).
- Час/тривалість — з `video.currentTime`/`video.duration`; тривалість `N/A` для live.
- Роздільність — `video.videoWidth` × `video.videoHeight`; `N/A`, поки метадані не завантажені.
- Буфер — `video.buffered` (секунди після поточної позиції), `N/A` без даних.
- Швидкість — **оцінка** наповнення буфера: `Δ(буфер, с) / Δ(час, с)`, згладжена EMA; показується як `≈N.NN× (ESTIMATED)`, `N/A`, поки немає 2 вимірювань. Це не бітрейт і не швидкість мережі.
- Рушій — `HTML5`.
- Остання помилка — `код · короткий опис` (з `ERROR_MESSAGES`).
- Журнал — останні 14 подій із часом: `Player initialized`, `Stream URL received`, `Video loading started`, `Metadata loaded`, `Playback started`, `Buffering started/ended`, `Playback paused`, `Playback ended`, `Playback error: N (...)`, `Autoplay blocked`, `Reconnect attempt`.

---

## 3. Як працюють налаштування VLC Player

1. Lampa зберігає вибір у `localStorage`: ключі `player`, `player_torrent`, `player_iptv` (`Lampa.Storage`).
2. Плагін завантажується до `Params.init()`, тому реєстрація меню відкладена до `app:ready`.
3. Після готовності `Menu.apply()` додає `vlc` у `Lampa.Params.values` (копія + новий ключ) і зберігає `defaults`.
4. Користувач відкриває **Налаштування → Плеєр**, вибирає `VLC Player`; Lampa викликає `Storage.set(key, 'vlc')`.
5. Натискання «Грати» → `Player.play(data)` → подія `create` → `isVlcSelected(data)`:
   - `true` → `abort()` + власний плеєр;
   - `false` → плагін нічого не робить, працює штатний плеєр Lampa.
6. Після перезапуску Lampa значення `'vlc'` лишається в `localStorage`; `Menu.apply()` знову додає опцію, тому підпис у меню відновлюється.

Обмеження: якщо плагін видалити, а `player = 'vlc'` залишиться, Lampa не знайде такої гілки та використає внутрішній плеєр (тихий fallback). Це поведінка Lampa, не плагіна.

---

## 4. Які показники відображає Debug Panel

| Показник | Джерело | Коли `N/A` |
|---|---|---|
| STATE | внутрішній стан сесії | ніколи (завжди відомий) |
| SOURCE | `data` + URL | якщо не визначено → `UNKNOWN` |
| TIME | `video.currentTime` | не скінченне значення |
| DURATION | `video.duration` | `NaN`/`Infinity`/`0` (live) |
| RESOLUTION | `video.videoWidth/Height` | до `loadedmetadata` |
| DOWNLOAD | оцінка за `buffered` | менше 2 вимірювань |
| BUFFER | `video.buffered` | немає жодного діапазону |
| ENGINE | константа рушія | ніколи (`HTML5`) |
| LAST ERROR | `MediaError.code` + текст | помилок не було (`—`) |
| EVENTS | журнал сесії | до першої події (порожньо) |

---

## 5. Які показники поки недоступні

- **Реальний бітрейт і швидкість мережі** — браузер не віддає кількість завантажених байтів для `<video>`; доступна лише оцінка наповнення буфера (`ESTIMATED`).
- **Кодек, профіль, FPS, кількість аудіодоріжок** — HTML5 не надає цих метаданих без демуксера.
- **Dropped frames / decode latency** — немає стандартного API.
- **HDR-метадані** — недоступні у JS (див. Етап 3).
- **Метрики AVPlay/webOS** — рушіїв ще немає; панель не показує фіктивних значень.

Архітектурно панель уже відокремлена від рушія: `createDebugPanel()` + `dbg(s, ...)`; майбутній AVPlay-адаптер зможе викликати ті самі `setState`/`setError`/`event` і додавати власні поля без переписування UI.

---

## 6. IPTV: дослідження та рішення

Перевірено код Lampa (`src/interaction/player.js`):

- `Player.play(data)` надсилає `create` — звичайне відео і торенти перехоплюються.
- `Player.iptv(data)` **не надсилає `create`**: одразу викликає `TV.locked(...)` → `start(data, 'iptv', launch)` → `TV.start(data)` → подія `TV.listener 'play'` → `Video.url(channel.url)`.
- Отже поточний `create`-гейт IPTV не покриває.

Варіанти наступного етапу:

1. **Обгортка `Lampa.Player.iptv`**: зберегти оригінал, підмінити функцією, яка перевіряє `player_iptv === 'vlc'` і відкриває власну сесію; інакше — викликати оригінал.
2. **Підписка на `Lampa.PlayerIPTV.listener`** (`play`, `channel`) — але це вже після створення штатного плеєра, тому як fallback.
3. **Власна логіка каналів**: `data.onGetChannel`, `data.total`, `data.onPlay`, `data.onGetProgram`, `data.locked`; або повторне використання `Lampa.PlayerIPTV` для zapping/EPG.

Ризик: IPTV-плагін CUB і `PlayerIPTV` можуть змінюватися; потрібен окремий етап 4.6 з тестами. У 4.1 IPTV **не реалізовано примусово**, щоб не ризикувати звичайним відтворенням.

---

## 7. Тестування

### Виконано автоматично

| Команда | Результат |
|---|---|
| `node --check Lampa-VLC-Player.js` | ✅ синтаксис OK |
| `node tests/static-check.js` | ✅ **57/57 PASS** |
| `node tests/menu-unit.js` | ✅ **17/17 PASS** |

`menu-unit.js` реально виконує плагін у Node з мінімальними заглушками та перевіряє:

- опція `vlc` додана в `player`, `player_torrent`, `player_iptv`;
- повторний `apply()` не дублює пункти (2 → 2);
- наявні опції збережені, `default` не змінені;
- `isVlcSelected` коректно розрізняє `player`/`player_torrent` та `inner`/`vlc`;
- `sourceKey` визначає тип джерела.

### Не виконано

| Перевірка | Причина |
|---|---|
| `tests/harness.html` (37 перевірок) | браузер у цьому середовищі не запускався; стенд підготовлено для ручного відкриття в Chrome/Opera |
| Реальна Lampa в Chrome | не запускалася |
| Tizen / webOS / Android TV | не тестувалися (Етап 4.1 їх не реалізує) |

Твердження «працює на пристрої» не робиться.

---

## 8. Відомі обмеження та ризики

1. **Залежність від внутрішньої структури Lampa**: `Lampa.Params.values`, `Params.select`, `SettingsApi` — публічні об’єкти, але не версіонований контракт. Потрібен регрес після оновлень Lampa.
2. **Приховані рядки на ПК**: Lampa сама видаляє `.is--player` на `browser`; тому додано окремий розділ через `SettingsApi`. Якщо `SettingsApi` зміниться — пункт зникне лише на ПК, TV-шлях (`Params.values`) залишиться.
3. **Швидкість у панелі** — оцінка, не бітрейт; позначена `ESTIMATED`.
4. **IPTV** не перехоплюється (див. розділ 6).
5. **Панель завжди увімкнена** під час розробки; у продакшені її треба вимкнути або зробити опцією.
6. **Немає тестів на реальному пристрої** — UI/клавіатура на TV не перевірені.

---

## 9. Наступні кроки

1. **Етап 4.2** — абстракція рушія (`engine` interface) + перенесення поточної HTML5-логіки під неї без зміни поведінки.
2. **Етап 4.3** — Tizen AVPlay-рушій (за Етапом 3): `open`/`prepareAsync`/`play`, `setDisplayRect`, `setDisplayMethod`, seek, destroy.
3. **Етап 4.4** — дорожки/субтитри (AVPlay `getTotalTrackInfo`/`setSelectTrack`, DOM-рендерер SRT/VTT).
4. **Етап 4.6** — IPTV через обгортку `Player.iptv` після окремого дослідження контракту `PlayerIPTV`.
5. Перед продакшеном — вимкнути Debug Panel або винести в налаштування.

---

## 10. Як перевірити вручну

1. `node tests/static-check.js` → 57/57.
2. `node tests/menu-unit.js` → 17/17.
3. Відкрити `tests/harness.html` у Chrome → 37/37 (очікувано).
4. У Lampa: Налаштування → Плеєр → вибрати **VLC Player** → «Грати» → має відкритися VLC-плеєр із панеллю `VLC PLAYER DEBUG` у лівому верхньому куті.
5. Вимкнути VLC (вибрати інший плеєр) → «Грати» → має працювати штатний плеєр Lampa без втручання плагіна.
