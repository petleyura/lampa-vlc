# Lampa VLC Player

Незалежний HTML5-програвач для медіапорталу **Lampa** у стилі VLC.
Плагін перехоплює запуск відео, скасовує штатний плеєр Lampa та відкриває
власний повноекранний інтерфейс.

> Поточний статус: **Етап 2 — прототип**. Реалізовано лише HTML5 Engine.
> AVPlay, webOS, Android Intent, IPTV, аудіодоріжки та субтитри — наступні етапи.

---

## Файли

| Файл | Призначення |
|---|---|
| `Lampa-VLC-Player.js` | Плагін (один файл, IIFE, без зовнішніх залежностей) |
| `tests/harness.html` | Браузерний тест-стенд із імітацією Lampa (22 перевірки) |
| `tests/static-check.js` | Статична перевірка коду в Node (37 перевірок) |
| `docs/ETAP-1-tech-report.md` | Технічне дослідження API Lampa (Етап 1) |

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

Очікуваний результат: `SUMMARY passed=37 failed=0`.

### 2. Браузерний тест-стенд

Відкрийте у Chrome/Opera:

```
tests/harness.html
```

Стенд імітує Lampa (`Lampa.Listener`, `Lampa.Player.listener`, `Lampa.Controller`,
`Lampa.Torserver.toPlayUrl`, `HTMLMediaElement.play/pause`) і виконує 22 перевірки:
перехоплення `create`, відсутність штатного плеєра, DOM, URL, кнопки, перемотку,
буферизацію, `Escape`, повернення контролера, повторний запуск, помилку декодування.

### 3. Реальна перевірка в Lampa

1. Запустіть Lampa у Chrome.
2. Підключіть плагін (див. вище).
3. Відкрийте фільм → «Грати».
4. Очікувано: штатний плеєр не з’являється, відкривається VLC-панель.
5. `Esc` → повернення до картки.

---

## Архітектура (всередині одного файлу)

```
init          — очікування app ready, ін’єкція CSS, підписка
interceptor   — Lampa.Player.listener 'create' → перевірка URL → abort() → session.open()
session       — життєвий цикл: контролер, таймлайн, body-lock, close()
engine        — HTML5 Video: load/play/pause/seek/rate/buffered/error/destroy
ui            — повноекранний контейнер + VLC-панель (DOM + CSS)
controls      — кнопки, прогрес-бар, налаштування
remote        — клавіатура (capture), заготовка під Lampa.Keypad
destroy       — pause → clear src → load() → зняття обробників → DOM → стан Lampa
```

`engine` спілкується з `ui` лише через `hooks` (`onMeta`, `onTime`, `onPlaying`,
`onError`, …), тому майбутній AVPlay/webOS-рушій не потребує змін UI.

---

## Відомі обмеження Етапу 2

- Лише прогресивний HTTP(S) (MP4/WebM). HLS/DASH поки не підключаються — нативний HLS є лише в Safari.
- MKV/HEVC/AC-3 залежать від браузера; у Chromium часто не відтворюються (буде показано помилку).
- Немає вибору аудіодоріжок і субтитрів.
- Немає підтримки таймлайну Lampa у зворотному напрямку (відображення прогресу на картці одразу після закриття може потребувати перезавантаження екрана).
- Повноекранний режим — вікно браузера (Fullscreen API не використовується).
- Tizen/webOS/Android TV не тестувалися; ключові коди (10009, 461, 4/27) ще не підключені до `Lampa.Keypad`.

---

## Діагностика

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
