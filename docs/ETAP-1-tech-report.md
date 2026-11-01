# Технічний звіт — Етап 1

## Дослідження API Lampa для створення кастомного відеоплеєра у стилі VLC

| | |
|---|---|
| **Мета** | Визначити технічну можливість розробки незалежного відеоплеєра (VLC-стиль) як JS-плагіна Lampa, що повністю замінює штатний плеєр |
| **Об'єкт дослідження** | Lampa — код застосунку `yumata/lampa-source`, коміт `71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2` (26.10.2026); TorrServer `YouROK/TorrServer`, гілка `master` |
| **Дата** | 01.11.2026 |
| **Статус** | Дослідження завершено. Код проєкту не змінювався, файли коду не створювалися, бібліотеки не встановлювалися |
| **Платформи** | Samsung Tizen, LG webOS, Android TV, десктопні браузери |

---

## 0. Короткий висновок

**Реалізація можлива, але не тим механізмом, який зазначено в технічному завданні.**

1. **`Lampa.Player.register()` не існує.** У поточній версії Lampa об'єкт `Lampa.Player` експортує фіксований набір методів, серед яких немає жодного методу реєстрації програвача (розділ 3). Єдиний метод із словом `register` у плеєрній підсистемі — `Lampa.PlayerVideo.registerTube()`, і він призначений для іншого (реєстрація «тюба» типу YouTube, а не плеєра).
2. **Штатна точка перехоплення існує і задокументована в коді:** подія `create` у `Lampa.Player.listener` із функцією `abort()`. Вона спрацьовує **до** створення DOM плеєра, до `Video.url()` і до вибору платформного програвача. Це єдиний надійний спосіб «не допустити запуску стандартного плеєра».
3. **Додатковий важіль — `data.launch_player`.** Якщо в обробнику `create` виставити `data.launch_player = 'lampa'`, Lampa гарантовано піде у внутрішню гілку і не запустить Android-intent, webOS-застосунок чи інший зовнішній плеєр (розділ 5.2).
4. **«Стандартний системний програвач» — не те саме, що «плеєр Lampa».** Штатний плеєр Lampa — це власний повноекранний DOM-шар із `<video>`. Платформні програвачі підключаються лише за певних налаштувань: на Tizen — AVPlay (`<object type="application/avplayer">`), на Android-збірці Lampa — зовнішній intent, на webOS — запуск системного застосунку (розділ 2.3, 10).
5. **HTML5 `<video>` покриває не все.** MP4/HLS/DASH — так (HLS через `hls.js`, DASH через `dash.js`, які Lampa вже возить із собою). MKV/HEVC/AC-3/DTS — залежить від пристрою; на Tizen HTML5-рушій поступається AVPlay, і Samsung прямо документує, що адаптивний стрімінг, 4K UHD та розширені субтитри в HTML5 не підтримуються (розділ 8).
6. **Перемикання аудіодоріжок у прогресивному MP4/MKV у Chromium неможливе** — `HTMLMediaElement.audioTracks` у Chromium доступний лише за експериментальним прапорцем, у Android WebView — відсутній. Реально це працює тільки для HLS (через `hls.js`) або через AVPlay/webOS (розділ 8.3).
7. **Торрент-потоки — це прямий HTTP-потік із підтримкою Range.** TorrServer віддає файл через `http.ServeContent`, тому `<video>` «їсть» таке посилання як звичайний файл; обмеження — контейнер і кодеки, а не транспорт (розділ 9).

**Головний технічний ризик** — не відсутність API, а відсутність публічного контракту: усе, на чому тримається перехоплення (`create`, `abort`, `launch_player`, `Controller`, `Keypad`), є внутрішніми механізмами Lampa, які можуть змінитися в будь-якому релізі.

---

## 1. Джерела та метод

Дослідження виконано **по коду**, а не по сторонніх описах. Основні джерела:

| Джерело | Що дає |
|---|---|
| `yumata/lampa-source` @ `71733ed…` | Повний код застосунку Lampa: `src/app.js`, `src/interaction/player.js`, `src/interaction/player/video.js`, `src/core/keypad.js`, `src/core/controller.js`, `src/interaction/torserver.js`, `src/interaction/torrent.js`, `src/core/android.js`, `src/core/platform.js`, `src/interaction/settings/params.js` |
| `yumata/lampa-source` → `docs/ru/02-lifecycle.md`, `03-events.md`, `10-player.md`, `13-controller.md` | Документація, згенерована в тому ж репозиторії; підтверджує `create`/`abort`, `start`, `ready`, `destroy`, `external` |
| `YouROK/TorrServer` @ `master` | `server/web/api/route.go`, `stream.go`, `play.go`, `server/torr/stream.go` |
| developer.samsung.com | Web engine specs, AVPlay API, «Playback Using Video Elements», «Playback Using AVPlay», медіа-специфікації 2024–2026 |
| webostv.developer.lge.com | Специфікації кодеків і протоколів стрімінгу |
| developer.android.com, MDN, BCD | Формати Android, `audioTracks`, `<track>`, Range |

Обмеження методу:

- Публічного версіонованого API-контракту Lampa немає; `docs/` у репозиторії — похідна від коду, а не офіційна специфікація.
- Дзеркало `lampa-source` синхронізується з розробкою, але **ідентичність конкретній збірці на конкретному телевізорі не гарантована** — не підтверджено.
- Перевірка на живих пристроях (Tizen/webOS/Android TV) у межах Етапу 1 **не проводилася**; усі висновки щодо поведінки на пристроях мають статус «очікувано за документацією виробника».

---

## 2. Як влаштований плеєр Lampa

### 2.1. Глобальний об'єкт

`src/app.js` у `initClass()` збирає `window.Lampa` із модулів застосунку:

```js
window.Lampa = { Listener: Subscribe(), Lang, Storage, Platform, Utils, ..., Controller, Activity, Keypad, ..., Player, PlayerVideo, PlayerInfo, PlayerPanel, PlayerPlaylist, ..., Timeline, ..., Torrent, Torserver, ..., Android, Tizen, ... }
```

Тобто плагін отримує доступ до тих самих екземплярів модулів, якими користується застосунок. Це не «API плагінів», а прямі посилання на внутрішні об'єкти.

### 2.2. Два рівні плеєра

| Рівень | Файл | Роль |
|---|---|---|
| `Lampa.Player` | `src/interaction/player.js` | Оркестратор: вибір платформної гілки, показ реклами, контейнер `.player`, панель, плейлист, таймлайн, контролери, закриття |
| `Lampa.PlayerVideo` | `src/interaction/player/video.js` | Володіє медіаелементом: створює `<video>`, ставить `src`, керує HLS/DASH, доріжками, субтитрами, перемоткою |

`PlayerVideo.create()` створює елемент так:

```js
if(Platform.is('tizen') && Storage.field('player') == 'tizen')      videobox = Tizen(cb)
else if (Platform.is('orsay') && Storage.field('player') == 'orsay') videobox = Orsay(cb)
else videobox = $('<video class="player-video__video" poster="./img/video_poster.png" crossorigin="anonymous"></video>')
```

Отже **штатний плеєр Lampa — це HTML5 `<video>`**, а не системний плеєр. Винятки — Tizen/Orsay (платформний API) та зовнішні гілки, описані нижче.

### 2.3. Платформні гілки вибору плеєра

`Player.start(data, need, inner)` (файл `player.js`) вибирає виконавця в такому порядку:

1. `if(data.launch_player) launch_player = data.launch_player` — ручне форсування.
2. `if(launch_player == 'lampa' || launch_player == 'inner' || Video.verifyTube(data.url))` → **внутрішній плеєр**.
3. `Platform.is('apple')` / `macOS()` / `apple_tv` → зовнішні застосунки за URL-схемами (`vlc://`, `infuse://`, `nplayer://` тощо).
4. `Platform.is('webos') && (Storage.field(player_need) == 'webos' || launch_player == 'webos')` → `webOS.service.request('luna://com.webos.applicationManager', {method:'launch', parameters:{id:'com.webos.app.photovideo', …}})`.
5. `Platform.is('android') && (Storage.field(player_need) == 'android' || launch_player == 'android' || (data.torrent_hash && !Torserver.gstWork()))` → `Android.openPlayer(data.url, data)` → `AndroidJS.openPlayer(...)` (intent у зовнішній плеєр).
6. `Platform.desktop() && Storage.field(player_need) == 'other'` → зовнішній шлях `player_nw_path` (типове значення — `C:/Program Files/VideoLAN/vlc/vlc.exe`).
7. Інакше — внутрішній плеєр.

Значення за замовчуванням (`src/interaction/settings/params.js`):

| Платформа | `player` / `player_torrent` за замовчуванням |
|---|---|
| Tizen | `tizen` (AVPlay) |
| webOS | `inner` (HTML5) |
| Android (збірка Lampa) | `android` (зовнішній intent); для торентів — єдиний варіант `android` |
| Десктоп (NW/Electron) | `inner`; альтернатива `other` (VLC за шляхом) |
| Браузер | `inner` |

**Висновок:** «не допустити запуску стандартного системного програвача» — це дві різні задачі: (а) не дати Lampa піти у зовнішню гілку (вирішується `launch_player`), (б) не дати створитися штатному DOM-плеєру (вирішується `create` + `abort`).

---

## 3. `Lampa.Player.register()` — перевірка

### 3.1. Методу не існує

Повний перелік експорту `src/interaction/player.js`:

```js
export default {
    init, listener, toggle, play, playlist, render, subtitles, runas,
    callback: onBack, opened, iptv, programReady: TV.programReady,
    close: backward, getUrlQuality, loading,
    timecodeRecording: Timeline.setRecording,
    playdata: ()=>work
}
```

`register` тут немає. Перевірено також:

- `Lampa.PlayerVideo` — експортує `registerTube`, `removeTube`, `verifyTube` (реєстрація **постачальника відео** типу YouTube, не плеєра);
- `Lampa.PlayerPanel` — `setTracks`, `setSubs`, `setLevels`, `setFlows`, `setQualitys`, `updateTranslate` (лише наповнення UI-списків);
- `Lampa.PlayerPlaylist` — `get/set/next/prev/canNext/position`.

У документації репозиторію (`docs/ru/10-player.md`) описано інтеграцію через **події**, а не через реєстрацію; слова `register` у розділі про плеєр немає.

> **Важливо:** метод `register` не знайдено ні в поточному коді, ні в документації репозиторію. Твердження про його існування в якихось старіших версіях **не підтверджено** — я не знайшов жодного підтвердження в доступних джерелах.

### 3.2. Що є замість реєстрації

| Метод / механізм | Призначення | Ключові параметри |
|---|---|---|
| `Lampa.Player.play(data)` | Запустити відтворення | `data.url`, `data.title`, `data.card`/`data.movie`, `data.quality`, `data.torrent_hash`, `data.playlist`, `data.subtitles`, `data.timeline`, `data.ffprobe`, `data.launch_player` |
| `Lampa.Player.runas(need)` | Примусово вибрати плеєр | `'lampa' \| 'inner' \| 'android' \| 'webos' \| 'ios' \| 'other' …` |
| `data.launch_player` | Те саме, але в об'єкті даних | те саме значення |
| `Lampa.Storage` `player`, `player_torrent`, `player_iptv` | Користувацька настройка вибору плеєра | `'inner' \| 'tizen' \| 'webos' \| 'android' \| …` |
| `Lampa.Player.listener` | Події життєвого циклу, зокрема `create` + `abort` | див. розділ 6.3 |
| `Lampa.PlayerVideo` | Пряме керування медіаелементом | `url()`, `video()`, `play()`, `pause()`, `to()`, `rewind()`, `speed()`, `volume()`, `destroy()` |
| `Lampa.PlayerVideo.registerTube()` | Реєстрація провайдера відео (YouTube) | `{name, verify(src), create(cb)}` |

### 3.3. Відповіді на сім питань ТЗ

| № | Питання | Відповідь |
|---|---|---|
| 1 | Чи існує `Lampa.Player.register()`? | **Ні.** У поточній версії такого методу немає (перевірено експорт `player.js`). |
| 2 | Які параметри приймає? | Питання не застосовне. Найближчі за змістом: `play(data)`, `runas(name)`, `playlist(array)`, `subtitles(array)`, `callback(fn)`. |
| 3 | Яку структуру має об'єкт програвача? | Контракту «об'єкт програвача» немає. Є контракт **об'єкта даних** для `play(data)` (див. 4.2). |
| 4 | Як Lampa вибирає програвач? | `start()`: `launch_player` → платформа → `Storage.field('player'/'player_torrent'/'player_iptv')` → внутрішній плеєр (див. 2.3). |
| 5 | Чи можна встановити пріоритет стороннього програвача? | **Ні.** Можна лише примусово вибрати одну з наявних гілок (`runas`/`launch_player`) або перехопити запуск подією `create`. |
| 6 | Чи можна повністю замінити стандартний програвач? | **Так, але не через реєстрацію.** Через `create` + `abort()` + власний повноекранний DOM і власний контролер. Штатний плеєр при цьому не створюється взагалі. |
| 7 | Чи є перехоплення до ініціалізації стандартного плеєра? | **Так.** Подія `create` — єдина точка, що спрацьовує до `work = data`, до `Video.url()`, до створення `<video>` і до вибору платформної гілки. |

---

## 4. Шлях «Грати»: покроково

### 4.1. Ланцюг викликів (торент-джерело)

`src/interaction/torrent.js`, обробник `hover:enter` на файлі торента:

```js
preload(element, () => {
    Player.play(element)
    Player.callback(() => { Controller.toggle('modal') })
    Player.playlist(playlist)
    ...
})
```

Далі `Player.play(data)` (`player.js`):

1. `listener.send('create', {data, abort: () => run = false})` — **точка перехоплення**;
2. `if(!run) return` — якщо плагін викликав `abort()`, далі нічого не відбувається;
3. вибір якості: якщо `data.quality` містить кілька варіантів — `data.url` замінюється на вибраний;
4. `lauch()`:
   - `work = data` (запам'ятовується для `playdata()`),
   - `Preroll.show(data, …)` (реклама, якщо є),
   - `listener.send('start', data)`,
   - `Video.url(Torserver.toPlayUrl(data.url))` — **фактичний запуск**,
   - `toggle()` — реєстрація/перемикання контролерів `player`/`player-loading`,
   - `Timeline.needToContinue(toggle)`,
   - `listener.send('ready', data)`.

### 4.2. Де і коли доступні `data.url` та картка

| Поле | Коли доступне | Звідки береться (торент) |
|---|---|---|
| `data.url` | вже в `create` | `Torserver.stream(path, hash, id)` — `/stream/<file>?link=<hash>&index=<id>&preload` (або `&play`, якщо preload вимкнено) |
| `data.torrent_hash` | вже в `create` | хеш торента |
| `data.id` | вже в `create` | `file_stats[].id` (індекс файлу) |
| `data.card` | вже в `create` | картка TMDB (`params.movie`) |
| `data.ffprobe` | вже в `create`, якщо джерело його передало | `SERVER.object.ffprobe` |
| `data.subtitles` | вже в `create` | масив `{label, url, index}` — URL субтитрів теж будуються через `Torserver.stream()` |
| `data.playlist` | вже в `create` | масив серій, зібраний у `torrent.js` |
| `data.timeline` | вже в `create` | `Lampa.Timeline.view(hash, …)` |
| `data.viewed(time)` | вже в `create` | колбек збереження таймкоду (TorrServer `viewed`) |

**Розбіжність із документацією:** `docs/ru/10-player.md` згадує `data.movie` як об'єкт картки. У торент-потоці поле називається `data.card` (`element.card = params.movie`), а `data.movie` у коді `player.js` взагалі не використовується. Для надійності слід читати `data.card || data.movie`.

**Важлива деталь:** `data.url` у момент `create` **ще містить `&preload`**. Заміна `&preload` → `&play` відбувається лише всередині `Video.url(Torserver.toPlayUrl(data.url))`. Плагін, який забирає URL із `create`, **мусить сам застосувати** `Lampa.Torserver.toPlayUrl(url)`, інакше TorrServer не почне віддавати байти.

### 4.3. Що фактично запускає відтворення

`PlayerVideo.url(src)` → `create()` (створення `<video>`/AVPlay) → вибір HLS/DASH/нативне → `load(src)`:

```js
function load(src){
    HlsStream.destroyParser()
    DashStream.destroy()
    video.src = src
    video.load()
    play()          // video.play() з обробкою Promise
}
```

Тобто «запуск» = `video.src = …; video.load(); video.play()`. Жодного виклику «зареєстрованого програвача» немає — його просто не існує.

### 4.4. Чи передається керування автоматично

**Ні.** Lampa завжди або (а) запускає власний `<video>`/AVPlay, або (б) відкриває зовнішній застосунок за URL-схемою/intent. Третього шляху немає. Єдиний спосіб отримати контроль — скасувати `create` і зробити все самому.

---

## 5. Механізми перехоплення

### 5.1. Основний: `create` + `abort()` (рекомендовано)

```js
Lampa.Player.listener.follow('create', (e) => {
    if (!enabledFor(e.data)) return

    e.data.launch_player = 'lampa'   // блокує android/webos/apple-гілки
    e.abort()                        // скасовує штатний плеєр
    session.open(e.data)             // власний плеєр
})
```

Підтвердження: код `play()` (`player.js`) і документація `docs/ru/03-events.md` («Срабатывает перед открытием плеера. Можно отменить запуск»), `docs/ru/10-player.md` (приклад з `data.abort()`).

Переваги: штатний плеєр не створюється, жодних зайвих мережевих запитів, жодного `<video>`-сміття.

### 5.2. Допоміжний: форсування внутрішньої гілки

```js
e.data.launch_player = 'lampa'
```

У `start()` перший рядок — `if(data.launch_player) launch_player = data.launch_player`, а друга умова — `launch_player == 'lampa' || 'inner'` → `launchInner()`. Це **єдиний підтверджений спосіб** гарантовано не допустити `Android.openPlayer`, `runWebOSPlayer` та зовнішні URL-схеми.

Нюанс: `launch_player` — модульна змінна, скидається лише в `backward()` (при закритті плеєра). Тому виставляти її треба **щоразу** в `create`, а не один раз.

### 5.3. Резервний (не рекомендовано): перехоплення після `start`/`ready`

Можна підписатися на `start` або `ready` і втручатися в `Lampa.PlayerVideo.video()`. Недоліки: `<video>` уже створений, `video.src` уже виставлений, запит до потоку вже пішов; доведеться приховувати `.player` і боротися з двома життєвими циклами. Документація (`docs/ru/10-player.md`) пропонує в `ready` перехоплювати `src` через `Object.defineProperty` — **цей приклад вводить в оману**: `src` на цей момент уже встановлено, і повторне визначення властивості не впливає на вже завантажений потік. Використовувати лише як аварійний fallback.

### 5.4. Наслідки `abort()` і що потрібно відтворити самостійно

Після `abort()`:

- `work` у `player.js` **не встановлюється** → `Lampa.Player.playdata()` повертає попереднє значення або `false`;
- `Lampa.Player.opened()` повертає `false` (`is_opened` виставляється лише в обробнику `start`);
- `Lampa.Player.listener` не отримає `start`/`ready`, а отже не спрацюють підписники Lampa (панель, плейлист, таймлайн, реклама);
- функція, передана в `Lampa.Player.callback(fn)`, **не буде викликана** — вона викликається лише в `backward()`;
- `Lampa.Player.close()` викликати **небезпечно**: `backward() → destroy()` звертається до `work.viewed`, а `work === false` → `TypeError`.

Тому плагін має сам реалізувати те, що робить `Player.destroy()`:

| Що робить штатний `destroy()` | Що має зробити плагін |
|---|---|
| `Timeline.destroy()` | зберегти таймкод у `Lampa.Timeline` |
| `work.viewed(time)` | викликати `data.viewed(currentTime)`, якщо є |
| `Background.theme('reset')` | повернути тему |
| `$('body').removeClass('player--viewing')` | прибрати свій клас |
| `Controller.toggle('content')` або `callback()` | повернути контролер, збережений до відкриття |
| `listener.send('destroy')` | надіслати власну подію для інших плагінів |

Практичний висновок: **перед відкриттям запам'ятовуйте `Lampa.Controller.enabled().name`** і на закритті робіть `Controller.toggle(savedName)` — саме так поводиться штатний код у `torrent.js` (`Player.callback(() => Controller.toggle('modal'))`).

---

## 6. Система подій: довідник

### 6.1. `Subscribe` (базова шина)

Файл `src/utils/subscribe.js`, фабрика `Lampa.Subscribe()`.

| Метод | Параметри | Поведінка |
|---|---|---|
| `follow(type, fn)` | `type` може містити кілька через кому (`'play,pause'`) | підписка |
| `add(type, fn)` | те саме, без розбору коми | підписка |
| `remove(type, fn)` | потрібне те саме посилання на функцію | відписка |
| `has(type, fn)` | | перевірка |
| `send(type, event = {})` | один об'єкт | синхронний виклик усіх слухачів; винятки ловляться і логуються |
| `destroy()` | | очищає все |

Обмеження: немає `stopPropagation`, немає черги, немає пріоритетів; порядок — порядок підписки. Слухач може лише мутувати переданий об'єкт.

### 6.2. `Lampa.Listener` (глобальна шина застосунку)

| Подія | Дані | Призначення |
|---|---|---|
| `app` | `{type:'start'}` / `{type:'ready'}` | старт і повна готовність застосунку |
| `activity` | `{type, component, object}` | переходи між екранами |
| `torrent_file` | `{type:'list_open'\|'render'\|'onenter'\|'onlong'\|'onfocus'\|'list_close', element, item, items, params}` | події списку файлів торента |
| `resize_start` / `resize_end` | — | зміна розміру вікна |
| `state:changed` | `{target, reason, method, type}` | зміни стану (напр. обране) |

Готовність застосунку в коді (`src/app.js`, кінець `startApp()`):

```js
window.appready = true
window.app_time_end = Date.now()
Lampa.Listener.send('app',{type:'ready'})
```

### 6.3. `Lampa.Player.listener`

| Подія | Дані | Коли | Обмеження |
|---|---|---|---|
| `create` | `{data, abort()}` | до всього іншого в `play()` | єдиний шанс скасувати запуск |
| `start` | `data` | після `work = data`, перед `Video.url()` | скасувати не можна |
| `ready` | `data` | після `Video.url()`, `toggle()`, таймлайну | потік уже завантажується |
| `destroy` | `{}` | у `Player.destroy()` | — |
| `external` | `data` | коли відкрито зовнішній плеєр | — |
| `infuse_build_url` | `{data, callbacks, setUrl}` | специфічно для Infuse | — |

### 6.4. `Lampa.PlayerVideo.listener`

| Подія | Дані |
|---|---|
| `canplay`, `play`, `pause`, `ended`, `rewind`, `loadeddata` | `{}` |
| `timeupdate` | `{duration, current}` |
| `progress` | `{down}` |
| `videosize` | `{width, height}` |
| `error` | `{error, fatal}` |
| `tracks` | `{tracks}` (AudioTrackList або масив) |
| `subs` | `{subs}` |
| `levels` | `{levels, current}` |
| `subtitle` (Tizen) | `{text}` |
| `webos_subs`, `webos_tracks` | сумісність зі старим способом |

Документація попереджає: модуль `PlayerVideo` перестворюється при кожному відкритті плеєра — підписки робити в `start`, знімати в `destroy`.

### 6.5. `Lampa.Keypad`

Файл `src/core/keypad.js`. Слухач `Lampa.Keypad.listener` (Subscribe), методи `init()`, `enable()`, `disable()`.

Події: `keydown`, `keyup`, `enter`, `longdown`, `back`, `left`, `right`, `up`, `down`, `toup`, `todown`, `playpause`, `play`, `pause`, `stop`, `rewindBack`, `rewindForward`, `info`, `toggle`.

Ключова особливість: `keydown` надсилається **до** перевірки `enabled` і **до** `Controller.move()`:

```js
listener.send('keydown',{code: keycode, enabled, event: e})
if(e.defaultPrevented) return
...
if(!enabled) return
```

Отже плагін може (а) отримувати всі клавіші навіть при `Keypad.disable()`, (б) **повністю заблокувати штатну навігацію**, викликавши `e.event.preventDefault()` у своєму обробнику `keydown`.

### 6.6. `Lampa.Controller`

Файл `src/core/controller.js`. Призначення — стек «контролерів екрана» та фокус.

| Метод | Призначення |
|---|---|
| `add(name, calls)` | зареєструвати контролер: `toggle`, `back`, `up`, `down`, `left`, `right`, `enter`, `long`, `finish`, `gone`, `invisible`, `link` |
| `toggle(name, force)` | перемкнути активний контролер (викликає `toggle`/`update`) |
| `back()` | викликати `back` активного контролера (з детекцією потрійного «назад») |
| `trigger(name)` | викликати довільний обробник активного контролера |
| `focus(elem)` | поставити фокус на DOM-елемент |
| `collectionSet(html, append, visible_only)` | зібрати `.selector`-елементи для навігації |
| `collectionFocus(target, html)` | сфокусувати конкретний елемент |
| `clear()` | очистити колекцію |
| `enabled()` | `{name, controller}` — **використовується для відновлення фокусу** |
| `windowOpen/windowClose/windowTop` | стек вікон (модалки/селекти) |

Пастка: якщо користувач натисне «назад» тричі швидко, `back()` робить `toggle('content', true)`, що викликає `gone()` поточного контролера. Власний контролер **мусить** мати безпечний `gone()`, інакше оверлей залишиться «сиротою».

### 6.7. `plugins:ready` — не знайдено

У перевірених файлах (`src/app.js`, `src/core/plugins.js`, `src/core/controller.js`, `src/core/keypad.js`, `src/interaction/player.js`) рядка `plugins:ready` немає. Застосунок не надсилає такої події ні в `Plugins.load()`, ні після нього.

Правильний механізм очікування готовності (задокументований у `docs/ru/02-lifecycle.md`):

```js
if (window.appready) init()
else Lampa.Listener.follow('app', (e) => { if (e.type == 'ready') init() })
```

Позначка: **існування `plugins:ready` в інших версіях/форках не підтверджено.**

### 6.8. Інші корисні модулі

| Модуль | Що дає |
|---|---|
| `Lampa.PlayerPanel` | `setTracks`, `setSubs`, `setLevels`, `setFlows`, `setQualitys` — наповнення штатної панелі |
| `Lampa.PlayerPlaylist` | `get()`, `set()`, `next()`, `prev()`, `canNext()`, `position()` |
| `Lampa.Timeline` | `view(hash, item)`, `update(view)`, `setRecording`, `needToContinue` |
| `Lampa.Torserver` | `ip()`, `url()`, `stream()`, `toPlayUrl()`, `gstWork()` |
| `Lampa.Android` | `openPlayer()`, `openTorrent()`, `playHash()`, `resetDefaultPlayer()` |
| `Lampa.Platform` | `is()`, `tv()`, `desktop()`, `screen()`, `chromeVersion()` |
| `Lampa.Storage` | `get/set/field` + події `change/add/clear` |

---

## 7. Перехоплення керування пультом

### 7.1. Модель обробки

Усі натискання проходять через `window.addEventListener('keydown', keydownTrigger)` у `keypad.js`. Схема: `keydown` → `listener.send('keydown')` → перевірка `defaultPrevented` → перевірка `enabled` → розбір коду → `Controller.move/trigger` → `preventDefault()`.

Для плагіна це означає:

- підписка на `Lampa.Keypad.listener.follow('keydown', fn)` дає **перший** доступ до клавіші;
- `e.event.preventDefault()` у цьому обробнику **зупиняє** штатну обробку (стрілки, back, медіаклавіші);
- `Keypad.disable()` — «грубе» блокування всієї навігації (окрім самого `keydown` і `Enter` на `keyup`);
- `Enter` обробляється на `keyup`, тому для блокування OK треба `preventDefault()` і на `keyup` (перевірка `!e.defaultPrevented` є в коді).

### 7.2. Коди клавіш (з `keypad.js`)

| Дія | Коди |
|---|---|
| Back / Return | `8`, `27`, `461` (LG), `10009` (Samsung), `88` (Orsay) |
| Вліво / Вправо / Вгору / Вниз | `37/39/38/40`; Orsay: `4/5/29460/29461` |
| Page Up / Down | `33/34` (LG), `427/428` (Samsung) |
| OK / Enter | `13`, `29443` (Orsay), `65385` (Tizen) |
| Play/Pause | `32`, `179`, `10252` (Tizen), `philipse.play_pause` |
| Play | `415`, `71` (Orsay) |
| Pause | `19`, `74` (Orsay) |
| Stop | `413`, `70` (Orsay) |
| Rewind Back / Forward | `412`, `69`, `177` / `418`, `417`, `72`, `176` |
| Info | `457` |
| Exit (Orsay) | `45` |
| Налаштування | `10133` |

### 7.3. Блокування штатної навігації

Рекомендована схема — **не** `Keypad.disable()`, а фільтр у власному обробнику:

```js
function onKey(e){
    if(!opened) return
    const code = e.code
    if (isOurs(code)) { e.event.preventDefault(); handle(code) }
}
Lampa.Keypad.listener.follow('keydown', onKey)
```

Так штатні контролери не отримують подію, але плагін зберігає повний контроль і може пропускати окремі клавіші.

### 7.4. Власний фокус

Два підходи:

1. **Повністю власний** — плагін сам малює фокус і не використовує `Controller`; тоді `Keypad`-фільтр блокує все, а навігація всередині панелі — власна.
2. **Інтеграція з Lampa** — `Controller.add('vlc_player', {toggle, back, up, down, left, right, enter, gone})` + `Controller.collectionSet(html)` / `Controller.collectionFocus(...)`; тоді працюють штатні `Navigator`, `hover:enter` і анімації фокуса.

Для VLC-панелі з горизонтальним рядом кнопок другий варіант дешевший: кнопки отримують клас `selector` і штатні події `hover:enter`.

### 7.5. Повернення фокусу на картку

Підтверджений патерн (використовується в самій Lampa):

```js
const prev = Lampa.Controller.enabled().name          // напр. 'modal' або 'content'
// ... відкриття власного плеєра ...
Lampa.Controller.toggle(prev)                          // на закритті
```

Якщо плеєр відкривали зі списку файлів торента — це `'modal'`; якщо з картки — `'content'`/`'full_start'`. Зберігати треба **ім'я контролера**, а не DOM-елемент: Lampa сама відновить колекцію `.selector` і фокус.

### 7.6. Особливості платформ

| Платформа | Особливості |
|---|---|
| **Tizen** | Back = `10009`; медіаклавіші (`MediaPlayPause`, `MediaPlay`, `MediaStop`, `MediaPause`, `MediaRewind`, `MediaFastForward`, `ChannelUp/Down`) треба реєструвати через `tizen.tvinputdevice.registerKey(...)` — це вже робить `src/core/platform.js`. Back/Return реєстрації не потребує. `tizen.tvinputdevice` доступний лише у Tizen-застосунку. |
| **webOS** | Back = `461`, канали = `33/34`. Lampa не використовує `webOS.platformBack()`; перехоплення — тим самим `keydown`. Для запуску системного плеєра використовується `luna://com.webos.applicationManager` (див. 2.3). |
| **Android TV** | Back = `4` або `27` (браузер/WebView). У збірці Lampa працює `AndroidJS`-інтерфейс, у браузері — звичайні `keydown`. Медіаклавіші пульта можуть приходити як `179/415/19`. |
| **Десктоп** | `8/27` + мишка; `Controller.focus` працює інакше (`navigation_type == 'mouse'`). |

---

## 8. HTML5 `<video>`: можливості та обмеження

### 8.1. Що вже вміє Lampa

- **HLS**: якщо `Hls` завантажений і `Hls.isSupported()` — `hls.js` (`HlsStream.createProgram`), інакше — нативний HLS (`video.canPlayType('application/vnd.apple.mpegurl')`). Вибір: `shouldUseProgram()` враховує `Storage.field('player_hls_method')`, `Platform.chromeVersion() > 120`, `playdata.hls_type` (`'hlsjs'`/`'native'`), платформу.
- **DASH**: `if(/\.mpd/.test(src) && typeof dashjs !== 'undefined')` → `dash.js` (лежить у `public/vender/dash/dash.js`).
- **Дорожки**: `hls.audioTracks` / `hls.subtitleTracks`, `video.audioTracks`, `video.textTracks`.
- **Субтитри**: `textTracks` + власний рендер `Cue` для HLS (`renderTextTracksNatively:false`).
- **Масштаб/швидкість/перемотка**: `objectFit`, `transform`, `video.playbackRate`, `currentTime`.

### 8.2. Матриця платформ

| | Tizen (M69–M130) | webOS (Chromium 53–120) | Android TV (Chrome/WebView) | Десктоп |
|---|---|---|---|---|
| MP4 (H.264/AAC) | так | так | так | так |
| MKV | платформою заявлено (H.264/HEVC/MPEG-2/VP9), але **в HTML5 — не гарантовано** | заявлено платформою; у HTML5 не гарантовано | платформа: mkv; WebView — обмежено | **не підтверджено** (Chromium не грає H.264-у-MKV) |
| HEVC | так (MKV/MP4/TS) — через медіарушій; у HTML5 — залежить від пристрою | так (заявлено) | так (Android 5.0+) | залежить від ОС |
| VP9/AV1 | так | так | так (AV1 з Android 10) | так |
| HLS нативно | заявлено в AVPlay; `canPlayType` — **не підтверджено** | HLS у списку протоколів | лише MPEG-TS HLS | Safari — так, Chrome — ні |
| DASH нативно | AVPlay — так | не заявлено (лише через MSE/dash.js) | ні | ні |
| `video.audioTracks` | лише за прапорцем (Chromium) | лише за прапорцем | **відсутній** (WebView) | Chrome — прапорець, Safari — так |
| `<track>` (WebVTT) | так | так | так | так |
| SRT напряму | ні (лише через конвертацію) | ні | ні | ні |
| Fullscreen API | так | не підтверджено | так | так |
| Range/seek | потрібен `Accept-Ranges` | те саме | те саме | те саме |

Джерела: Samsung Web Engine Specifications, Samsung «Playback Using Video Elements»/«Playback Using AVPlay», Samsung TV Video Specifications 2024, LG «Video & Audio Codecs» і «Streaming Protocol and DRM», Android «Supported media formats», MDN `audioTracks`/`<track>`/Range, BCD.

**Ключове розмежування (Samsung):** таблиці кодеків описують **медіарушій телевізора**, а не HTML5. Samsung прямо зазначає, що адаптивний стрімінг, 4K UHD і розширені формати субтитрів у HTML5 не підтримуються — для них є AVPlay. Тому «HTML5 video підтримує MKV» — хибне узагальнення: контейнер може бути в медіарушії, але недоступний через `<video>`.

### 8.3. `video.audioTracks`

MDN: «Limited availability… does not work in some of the most widely-used browsers». У Chromium API доступний за прапорцем `#enable-experimental-web-platform-features`, у Android WebView — `false`, у Safari — так.

Практичні наслідки:

- **MP4/MKV з кількома аудіодоріжками** у Chromium на TV: перемикання неможливе; браузер грає доріжку за замовчуванням.
- **HLS**: `hls.audioTracks` + `hls.audioTrack = id` — працює (Lampa це використовує).
- **Tizen**: `webapis.avplay.getTotalTrackInfo()` + `setSelectTrack('AUDIO', index)` — працює.
- **webOS**: Lampa має обхід — `WebOSParser` перестворює `<video>` і після перезавантаження читає `webos_tracks` (файл `video/webos.js`). Це підтверджує, що на webOS `audioTracks` «з коробки» ненадійний.

### 8.4. Субтитри

- `textTracks` + `<track kind="subtitles" src="...vtt">` — стандартний шлях; **лише WebVTT**.
- SRT треба конвертувати у VTT (або рендерити вручну, як робить Lampa через `Cue`).
- Cross-origin `<track>` потребує атрибута `crossorigin` на `<video>` (Lampa його ставить: `crossorigin="anonymous"`).
- ASS/SSA (типові для торентів) у HTML5 не підтримуються взагалі — потрібен власний рендерер або конвертація.

### 8.5. Перемотка та Range

Браузер виконує `Range`-запити для seek. Якщо сервер не підтримує Range — віддається `200` і повний body, гранулярний seek стає неможливим. TorrServer Range підтримує (розділ 9). Додатковий ризик: `crossorigin="anonymous"` вимагає CORS-заголовків; TorrServer має `AllowAllOrigins = true` (розділ 9).

### 8.6. Апаратне декодування

Вибір декодера — за браузером/платформою; `<video>` використовує апаратний декодер, якщо кодек і контейнер підтримуються. Гарантувати «апаратне декодування» з JS неможливо; можна лише вибрати кодек/контейнер, який пристрій декодує апаратно (H.264/AAC у MP4 — найбезпечніший варіант).

### 8.7. Висновок розділу

| Вимога | Реальність |
|---|---|
| HTTP/HTTPS-потоки | так |
| HLS | так (hls.js; нативно — залежно від платформи) |
| MPEG-DASH | так (dash.js), але не на Tizen AVPlay-гілці |
| MP4 | так |
| MKV | **залежить від пристрою**; на десктопному Chromium — часто ні |
| HEVC | залежить від пристрою |
| Апаратне декодування | гарантоване лише для «рідних» кодеків пристрою |
| Перемотування / Range | так, за умови підтримки сервером |
| Вибір аудіодоріжок | лише HLS/AVPlay/webOS-обхід |
| Вибір субтитрів | так, WebVTT; SRT/ASS — конвертація/власний рендер |

---

## 9. Торрент-потоки

### 9.1. Формат посилання

`src/interaction/torserver.js`:

```js
function stream(path, hash, id){
    if(gstWork()) return url() + '/gst/' + encodeURIComponent(hash) + '/master.m3u8?index=' + id + '&audio=0'
    return url() + '/stream/'+ encodeURIComponent(path.split('\\').pop().split('/').pop()) +
           '?link=' + hash + '&index=' + id + '&' + (Storage.field('torrserver_preload') ? 'preload' : 'play')
}
function toPlayUrl(url){
    return ip() && url.indexOf(ip()) >= 0 ? url.replace('&preload','&play') : url
}
```

Приклад: `http://192.168.1.10:8090/stream/Movie.2024.mkv?link=<infohash>&index=3&preload`
Під час відтворення: `…&index=3&play`.

### 9.2. Що фактично віддає TorrServer

`server/web/api/route.go`: `GET/HEAD /stream/*fname`, `GET /play/:hash/:id`, `GET /subs/:hash/:id`, `GET /ffp/:hash/:id`.

`server/web/api/stream.go` — обробник `stream()`: `play` → `tor.Stream(index, req, w)`.
`server/torr/stream.go` — `Torrent.Stream()`:

```go
resp.Header().Set("content-type", mime.String())        // якщо mime.IsMedia()
resp.Header().Set("ETag", …)
if req.Header.Get("Range") != "" { resp.Header().Set("Accept-Ranges", "bytes") }
http.ServeContent(resp, req, file.Path(), time.Unix(t.Timestamp,0), newBufferedStreamReader(reader, 1<<20))
```

`http.ServeContent` — стандартна бібліотека Go: `206 Partial Content`, `Content-Range`, `Content-Length`, `Accept-Ranges`. **Це звичайний прогресивний байтовий потік одного файлу, без транскодування і без сегментації.**

Параметри:

| Параметр | Дія |
|---|---|
| `play` | почати віддавати байти (єдина гілка, що стрімить) |
| `preload` | наповнити кеш TorrServer без віддачі клієнту |
| `stat` | `c.JSON(200, tor.Status())` — `preloaded_bytes`, `preload_size`, `download_speed`, `active_peers`, `total_peers`, `file_stats[]` |
| `m3u` | віддати m3u-плейлист |
| `index` | id файлу з `file_stats` (1-based); ім'я у шляху на вибір файлу **не впливає** |

CORS: у `server/web/server.go` — `AllowAllOrigins = true`, `AllowPrivateNetwork = true`; коментар у `subs.go` підтверджує, що глобальний middleware додає `Access-Control-Allow-Origin`.

### 9.3. Чи можна передати таке посилання прямо в `<video>`

**Так.** Це HTTP-ресурс із `Content-Length`, `Content-Type` і Range. `<video src="…&play">` працює як зі звичайним файлом — за умови, що контейнер і кодеки підтримуються платформою (див. 8.2). Для MKV/HEVC/AC-3 на десктопному Chromium — часто ні.

### 9.4. Аудіодоріжки та субтитри з такого джерела

- **Аудіодоріжки**: у прогресивному потоці браузер бачить лише «доріжку за замовчуванням»; `video.audioTracks` у Chromium недоступний. TorrServer **не транскодує** і не розділяє доріжки у `/stream`. Отже перемикання аудіо на такому потоці — **неможливе** без HLS/AVPlay.
- **Метадані доріжок**: `data.ffprobe` (якщо торент-плагін його передав) перетворюється в `translate.tracks` через `tracksFromFfprobe()` — але це **лише підписи**, не перемикання.
- **Субтитри**: Lampa будує URL окремих файлів `.srt` з того ж торента (`parseSubs` → `Torserver.stream(path, hash, id)`), тобто субтитри — це теж HTTP-файли. Формат SRT → потрібна конвертація у VTT або власний рендер.
- TorrServer також має `GET /ffp/{hash}/{id}` (ffprobe) і `GET /subs/{hash}/{id}` (WebVTT), але **Lampa на цьому коміті їх не використовує**.

### 9.5. HLS-режим (`gst`)

`/gst/:hash/master.m3u8?index=N&audio=0` існує **лише** у збірках TorrServer із тегом `gst` (`//go:build gst`); у стандартному бінарнику маршрутів `/gst/*` немає (`bridge_stub.go` — `//go:build !gst`, порожній `SetupRoute`). README прямо зазначає: «no runtime switch that can add `/gst/*` routes to a standard binary»; окремі бінарники `TorrServer-gst-*` публікуються з релізу 141.10, а `GET /gst/settings` у звичайній збірці повертає `built_in:false`. Lampa вмикає цей режим, якщо `Storage.field('torrserver_gts')` і `GET /gst/echo` відповів успішно (`gstWork()`).

Значення для проєкту: **HLS-режим — єдиний реальний шлях до перемикання аудіодоріжок у браузері** (через `hls.js`), але він вимагає gst-збірки TorrServer і не є типовим.

### 9.6. Обмеження

- `Connection: close` на кожен `/stream` — багато коротких з'єднань.
- `--maxsize` → `403` для великих файлів.
- При `--httpauth` `/stream` може віддати `401`, якщо торрент ще не доданий.
- WAF може блокувати за `Referer/Origin`.
- Немає транскодування: якщо кодек не підтримується — потік не відтвориться.
- Метадані доріжок доступні лише через окремий `GET /ffp/{hash}/{id}` (під auth), який потребує встановленого ffprobe на сервері (`GET /ffp/status` → `{"available": bool}`); у масовому `&stat` їх немає.
- CORS: `AllowHeaders` не містить `Range`; для звичайного `<video src>` це не критично (медіа-запит не є preflight-запитом), але для ручних `fetch` із `Range` може вимагати перевірки.

---

## 10. Відмінності Tizen / webOS / Android TV / десктоп

| Аспект | Tizen | webOS | Android TV | Десктоп |
|---|---|---|---|---|
| Штатний плеєр Lampa | AVPlay за замовчуванням (`player='tizen'`), HTML5 — якщо перемкнути | HTML5 (`inner`) | Зовнішній intent (`android`) | HTML5 (`inner`) |
| Що блокувати плагіну | `AVPlay`-гілку і зовнішні схеми | запуск `com.webos.app.photovideo` | `AndroidJS.openPlayer` / intent | `player='other'` (VLC-шлях) |
| Back | `10009` | `461` | `4`/`27` | `8`/`27` |
| Медіаклавіші | потрібен `registerKey` | звичайні `keydown` | звичайні `keydown` | не актуально |
| Кодеки HTML5 | обмежені; AVPlay краще | краще, ніж Tizen, але MKV/HEVC — за моделлю | залежить від SoC | MP4/WebM; MKV — часто ні |
| `audioTracks` | прапорець | прапорець + обхід Lampa | відсутній | Chrome — прапорець, Safari — так |
| HLS | AVPlay | нативно (заявлено) | лише TS | hls.js |
| DASH | AVPlay | dash.js | dash.js | dash.js |
| Fullscreen | так | не підтверджено | так | так |
| Ризик «чужого» плеєра | середній (AVPlay — це системний рушій, але в межах застосунку) | низький | **високий** (типово зовнішній) | середній (VLC-шлях) |

Головний практичний висновок: **на Tizen відмова від AVPlay на користь HTML5 — це втрата кодеків**. Якщо мета — «VLC-подібний UI», а не «HTML5 за будь-яку ціну», то на Tizen доцільно зберегти AVPlay як рушій, а VLC-стиль реалізувати як власний UI-шар над ним.

---

## 11. Рекомендована архітектура плагіна

### 11.1. Принципи

1. **Один перехоплювач, один життєвий цикл.** Плагін не «реєструється» в Lampa, а перехоплює `create` і далі повністю володіє сесією.
2. **UI і рушій розділені.** VLC-панель не знає, `<video>` там, `hls.js` чи AVPlay.
3. **Рушій вибирається за платформою і кодеком**, а не «один на всіх».
4. **Стан Lampa відновлюється явно**: контролер, тема, таймлайн, `viewed`.
5. **Жодних змін у файлах Lampa** — тільки публічні об'єкти `window.Lampa` і DOM.

### 11.2. Модулі

```
vlc-player/
├── bootstrap      — чекає app:ready / window.appready, читає налаштування
├── interceptor    — Player.listener 'create': launch_player='lampa', abort(), session.open(data)
├── session        — життєвий цикл: збереження контролера, відкриття/закриття, таймлайн
├── ui/
│   ├── overlay    — повноекранний контейнер (z-index вище .player, клас vlcplayer)
│   ├── panel      — VLC-панель: play/pause, seek, час, гучність, аудіо, субтитри, fullscreen
│   └── menu       — списки дорожок/субтитрів/плейлиста (можна через Lampa.Select)
├── engine/
│   ├── base       — інтерфейс: mount/load/play/pause/seek/volume/tracks/destroy
│   ├── html5      — <video> для MP4/HLS(натив)/DASH(dash.js)
│   ├── hlsjs      — hls.js: рівні, audioTracks, subtitleTracks, cues
│   ├── tizen      — AVPlay: open/prepareAsync/setSelectTrack/setExternalSubtitlePath
│   └── webos      — <video> + обхід отримання дорожок (за потреби)
├── tracks         — ffprobe → підписи; мапінг індексів; вибір дорожки
├── subtitles      — SRT→VTT, <track>, кастомний рендер ASS
├── remote         — Keypad-фільтр, Controller-реєстрація, back/OK/стрілки
├── timeline       — Lampa.Timeline + data.viewed(time)
└── playlist       — data.playlist / Lampa.PlayerPlaylist.get()
```

### 11.3. Життєвий цикл сесії

1. `create` → перевірка «наш чи ні» (налаштування, джерело, платформа).
2. `data.launch_player = 'lampa'`; `e.abort()`.
3. Зберегти `prev = Lampa.Controller.enabled().name`; `Lampa.Background.theme('black')`; `$('body').addClass('player--viewing')`.
4. Створити оверлей, змонтувати рушій, завантажити URL (`Lampa.Torserver.toPlayUrl(data.url)`).
5. `Controller.add('vlc_player', {...})`; `Controller.toggle('vlc_player')`; підписати `Keypad`.
6. Відтворення; таймлайн; субтитри; дорожки.
7. Закриття (Back або кнопка): зупинити рушій, `data.viewed(time)`, `Timeline.update`, зняти підписки, `Controller.toggle(prev)`, `Background.theme('reset')`, видалити оверлей.

### 11.4. Потік даних

```
torrent.js / online-джерело
        │  Player.play(data)
        ▼
Player.play ──create──► interceptor ──abort──► session.open(data)
                                                   │
                                     ┌─────────────┴─────────────┐
                                     ▼                           ▼
                                engine.load(url)            ui.render(data)
                                     │                           │
                               tracks/subtitles            remote/controller
                                     │                           │
                                     └────────► timeline ◄───────┘
```

### 11.5. Абстракція рушія (мінімальний контракт)

| Метод | Призначення |
|---|---|
| `mount(container)` | створити `<video>`/`<object>` у контейнері |
| `load(url, opts)` | встановити джерело, тип (hls/dash/file) |
| `play() / pause() / seek(t)` | транспорт |
| `time() / duration() / buffered()` | прогрес |
| `volume(v) / mute(b)` | звук |
| `audioTracks() / selectAudio(i)` | доріжки (або `[]`, якщо недоступно) |
| `subtitleTracks() / selectSub(i)` | субтитри |
| `destroy()` | звільнення ресурсів |

### 11.6. Що робити з технічно неможливими вимогами

| Вимога | Статус | Альтернатива |
|---|---|---|
| Перемикання аудіодоріжок у MKV/MP4 (прогресивний потік) | неможливо в Chromium | (а) HLS через gst-режим TorrServer; (б) AVPlay на Tizen; (в) інформувати користувача «доріжка одна» |
| Вибір вбудованих субтитрів MKV | неможливо в HTML5 | зовнішні `.srt` з торента (`data.subtitles`), конвертація у VTT |
| ASS/SSA | неможливо штатно | власний рендерер або конвертація на льоту |
| Гарантія апаратного декодування | неможливо з JS | пріоритет H.264/AAC/MP4 |
| Повна заміна плеєра «штатно» | неможливо (немає `register`) | `create` + `abort` + власний UI |

---

## 12. Технічні ризики

| № | Ризик | Ймовірність | Вплив | Пом'якшення |
|---|---|---|---|---|
| 1 | Lampa змінить `create`/`abort`/`launch_player` | середня | високий | версійна перевірка, feature-detection, fallback на `start`-перехоплення, тести після кожного релізу |
| 2 | `abort()` ламає стан Lampa (немає `work`, `callback`) | висока (завжди) | середній | власна сесія: контролер, тема, таймлайн, `viewed` |
| 3 | MKV/HEVC не грає в HTML5 на частині пристроїв | висока | високий | AVPlay на Tizen, перевірка `canPlayType`, повідомлення користувачу |
| 4 | Немає перемикання аудіодоріжок | висока | середній | HLS (gst), AVPlay, явне попередження |
| 5 | Конфлікт контролерів/фокуса, «застрягання» Back | середня | середній | `gone()`, збереження/відновлення `Controller.enabled().name`, обробка потрійного Back |
| 6 | Подвійний запуск (наш плеєр + штатний) | низька | високий | перевірка `Lampa.Player.opened()` і власного прапорця |
| 7 | CORS/`crossorigin` для `<track>` і субтитрів | середня | середній | перевірка заголовків, проксі, blob-URL |
| 8 | Autoplay-політика (звук без жесту) | низька на TV, середня в браузері | середній | запуск після `hover:enter` (жест уже є), `muted`-фолбек |
| 9 | Продуктивність на слабких TV (4K, важкий CSS) | середня | середній | мінімум DOM, `transform`/`opacity`, без важких фільтрів |
| 10 | Оновлення TorrServer (нові `/subs`, `/ffp`) | низька | низький | не залежати від недокументованих ендпоінтів |
| 11 | Відсутність тестових пристроїв | висока | високий | емулятори Tizen/webOS + 2–3 реальні TV |

---

## 13. План наступних етапів

| Етап | Зміст | Результат |
|---|---|---|
| **2. Прототип перехоплення** | `create` + `abort`, оверлей, власний контролер, Back/OK, повернення фокуса | Доведено, що штатний плеєр не з'являється, а Lampa коректно повертається |
| **3. Рушій HTML5 + HLS** | `<video>`, `hls.js`, seek, гучність, субтитри WebVTT | Відтворення MP4/HLS, керування з пульта |
| **4. Дорожки й субтитри** | `hls.audioTracks`, ffprobe-підписи, SRT→VTT, вибір дорожки | Перемикання аудіо там, де це технічно можливо |
| **5. Tizen AVPlay** | адаптер AVPlay, `getTotalTrackInfo`/`setSelectTrack`, життєвий цикл | Кодеки Tizen без втрат |
| **6. UI VLC** | панель, іконки, анімації, OSD, налаштування | Візуальна відповідність VLC |
| **7. Тестування** | матриця пристроїв, регрес після оновлень Lampa | Звіт сумісності |

---

## 14. Питання, які треба закрити до першого рядка коду

1. **Які версії Lampa підтримуємо?** Офіційна збірка, форки, MSX-версія — різні гілки коду.
2. **Tizen: HTML5 чи AVPlay?** Від цього залежить, чи втрачаємо MKV/HEVC.
3. **Чи прийнятне обмеження «аудіодоріжки тільки в HLS/gst»?** Якщо ні — потрібен інший підхід (зовнішній сервер/транскодування).
4. **Які джерела обслуговуємо?** Лише торенти, чи також онлайн-джерела, IPTV, YouTube.
5. **Субтитри:** лише зовнішні файли чи потрібні вбудовані (MKV)?
6. **Чи можна змінювати `Storage`-налаштування** (`player`, `player_torrent`) під час роботи плагіна, чи це має бути явний перемикач?
7. **Чи потрібна синхронізація таймкоду з акаунтом CUB** і `Timeline` Lampa?
8. **Мова інтерфейсу** (uk/ru/en) і чи використовувати `Lampa.Lang`.
9. **Дизайн VLC:** чи є ліцензійні вимоги до логотипу/іконок VLC (GPL-контент).
10. **Тестові пристрої:** які саме моделі Tizen/webOS/Android TV доступні.

---

## Додаток А. Перевірені джерела

**Lampa (код):**

- `src/app.js` — `initClass()`, `window.appready`, `Lampa.Listener.send('app',{type:'ready'})`
- `src/interaction/player.js` — `play()`, `create`/`abort`, `start()`, `runas()`, `callback()`, `close()`, експорт без `register`
- `src/interaction/player/video.js` — `<video>`, `url()`, `load()`, `destroy()`, HLS/DASH
- `src/interaction/player/video/hls.js` — `shouldUseProgram()`, `audioTracks()`, субтитри
- `src/interaction/player/video/tizen.js` — AVPlay-обгортка
- `src/interaction/player/video/webos.js` — `WebOSParser`, обхід дорожок
- `src/core/keypad.js` — коди, `keydown`/`keyup`, `enabled`
- `src/core/controller.js` — `add`/`toggle`/`back`/`collectionSet`/`enabled`
- `src/utils/subscribe.js` — `follow`/`send`/`remove`
- `src/interaction/torserver.js` — `stream()`, `toPlayUrl()`, `gstWork()`
- `src/interaction/torrent.js` — формування `data`, `Player.play`, `parseSubs`
- `src/interaction/settings/params.js` — значення `player` за замовчуванням
- `src/core/android.js` — `openPlayer`, `AndroidJS`
- `src/core/platform.js` — визначення платформи, `registerKey`
- `docs/ru/02-lifecycle.md`, `03-events.md`, `10-player.md`, `13-controller.md`

**TorrServer:**

- `server/web/api/route.go`, `stream.go`, `play.go`
- `server/torr/stream.go` — `http.ServeContent`, Range, Content-Type
- `server/web/server.go` — CORS
- `server/gstreamer/*` — `/gst/*` лише у `gst`-збірках

**Зовнішні:**

- Samsung: Web Engine Specifications; AVPlay API; «Playback Using Video Elements»; «Playback Using AVPlay»; TV Video Specifications 2024
- LG: Video & Audio Codecs; Streaming Protocol and DRM; Web API and Web Engine
- Android: Supported media formats
- MDN: `HTMLMediaElement.audioTracks`, `<track>`, Range requests
- BCD: `api.HTMLMediaElement.audioTracks`

---

## Додаток Б. Що не підтверджено

1. Існування `Lampa.Player.register()` у будь-якій версії Lampa — підтверджень не знайдено.
2. Існування події `plugins:ready` — у перевіреному коді відсутня.
3. Ідентичність коду дзеркала `lampa-source` конкретній продакшн-збірці на пристрої.
4. Точні значення `canPlayType('application/vnd.apple.mpegurl')` і `('application/dash+xml')` на Tizen/webOS.
5. Підтримка MKV/H.264 у `<video>` на десктопному Chromium і Firefox.
6. Підтримка MPEG-DASH у системному плеєрі LG (у таблиці протоколів не зазначено).
7. 5.1 passthrough саме через HTML5 `<video>` на Samsung/LG.
8. Поведінка Fullscreen API у webOS.
9. Autoplay-політика TV-браузерів окремо від Chrome.
10. «Експериментальність» gst-режиму TorrServer.
11. Точний `Content-Type` для `.srt` у TorrServer.
