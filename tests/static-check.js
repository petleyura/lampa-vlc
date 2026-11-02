/*
 * Статична перевірка Lampa-VLC-Player.js (без браузера).
 * Запуск: node tests/static-check.js
 *
 * Це НЕ замінює браузерні тести: перевіряються лише структура коду,
 * наявність обов'язкових механізмів і відсутність заборонених викликів.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'Lampa-VLC-Player.js');
const src = fs.readFileSync(file, 'utf8');

const results = [];

function check(name, condition, extra) {
    results.push({ name, ok: !!condition, extra: extra || '' });
}

/* ---------- 1. Синтаксис ---------- */
try {
    new Function(src);
    check('Синтаксис файлу валідний (new Function)', true);
} catch (e) {
    check('Синтаксис файлу валідний (new Function)', false, e.message);
}

/* ---------- 2. Обов'язкові механізми ---------- */
check('Самовиклична функція (IIFE)', /^\(function \(\) \{/m.test(src));
check('Захист від повторної ініціалізації', /if \(window\.__lampaVlcPlayer\)/.test(src));
check('Очікування готовності через window.appready', /window\.appready/.test(src));
check('Підписка на Lampa.Listener app:ready',
    /Listener\.follow\('app',[\s\S]{0,120}type === 'ready'/.test(src));
check('Підписка на Player.listener create', /listener\.follow\('create', onPlayerCreate\)/.test(src));
check('Виклик abort() у перехоплювачі', /event\.abort\(\)/.test(src));
check('Форсування внутрішньої гілки launch_player', /launch_player = 'lampa'/.test(src));
check('Використання Lampa.Torserver.toPlayUrl', /Torserver\.toPlayUrl/.test(src));
check('Збереження попереднього контролера', /Controller\.enabled\(\)/.test(src));
check('Повернення контролера через Controller.toggle', /Controller\.toggle\(/.test(src));

/* ---------- 3. Заборонені виклики ---------- */
check('НЕ викликається Lampa.Player.play()', !/Lampa\.Player\.play\s*\(/.test(src));
check('НЕ викликається Lampa.Player.close()', !/Lampa\.Player\.close\s*\(/.test(src));
check('НЕ використовується plugins:ready', !/plugins:ready/.test(src));

/* ---------- 4. Очищення ---------- */
check('video.pause() у destroy', /video\.pause\(\)/.test(src));
check('removeAttribute(\'src\') у destroy', /removeAttribute\('src'\)/.test(src));
check('video.load() після очищення', /video\.load\(\)/.test(src));
check('Видалення DOM-контейнера', /removeChild\(s\.ui\.root\)/.test(src));
check('Зняття keydown-обробника', /removeEventListener\('keydown', s\.keydownHandler, true\)/.test(src));

/* ---------- 5. UI / VLC ---------- */
check('Колір #FF8800', /#FF8800/i.test(src));
check('fixed-позиціонування', /position:fixed/.test(src));
check('object-fit: contain', /object-fit:contain/.test(src));
check('SVG-логотип', /class="vlc-logo"/.test(src));
check('Автоприховування панелі', /CONFIG\.uiHideDelay|uiHideDelay/.test(src));
check('Кнопки play/back/fwd/audio/settings/close',
    ['data-act="toggle"', 'data-act="back"', 'data-act="fwd"', 'data-act="audio"', 'data-act="settings"', 'data-act="close"']
        .every(s => src.indexOf(s) > -1));
check('Прогрес-бар з буфером і повзунком', /vlc-buffer/.test(src) && /vlc-thumb/.test(src));
check('Панель аудіодоріжок', /vlc-audio/.test(src) && /data-audio-list/.test(src) && /АУДІОДОРІЖКА/.test(src));
check('Отримання та перемикання аудіодоріжок', /function refreshAudioPanel/.test(src) && /function selectAudioTrack/.test(src));

/* ---------- 6. Клавіатура ---------- */
check('Space (32)', /code === 32/.test(src));
check('ArrowLeft (37) / ArrowRight (39)', /code === 37/.test(src) && /code === 39/.test(src));
check('Escape (27)', /code === 27/.test(src));
check('Enter (13)', /code === 13/.test(src));
check('Обробники лише для активної сесії', /if \(!session \|\| session !== s\) return;/.test(src));

/* ---------- 7. Помилки ---------- */
['1', '2', '3', '4'].forEach(code => {
    check('Повідомлення для MediaError ' + code, new RegExp('\\n\\s*' + code + '\\s*:\\s*\\{').test(src));
});
check('Стан LIVE для невідомої тривалості', /isFinite\(duration\)/.test(src) && /vlc-live/.test(src));

/* ---------- 7.1. Етап 4.1: меню Lampa ---------- */
check('Меню: ключі player/player_torrent/player_iptv',
    /keys:\s*\['player',\s*'player_torrent',\s*'player_iptv'\]/.test(src));
check('Меню: використовує Lampa.Params.select', /Params\.select\(key, merged, def\)/.test(src));
check('Меню: не дублює опцію', /if \(values\[Menu\.option\] === Menu\.label\) return;/.test(src));
check('Меню: зберігає наявні опції', /merged\[name\] = values\[name\]/.test(src));
check('Меню: не змінює default (передає наявний)', /var def = Params\.defaults \? Params\.defaults\[key\] : undefined/.test(src));
check('Меню: fallback без Params.select', /values\[Menu\.option\] = Menu\.label;/.test(src));
check('Меню: ПК-розділ через SettingsApi.addParam', /SettingsApi\.addParam\(/.test(src));
check('Меню: ПК-розділ лише коли Platform.any() === false', /Platform\.any\(\)\) return;/.test(src));

/* ---------- 7.2. Етап 4.1: перехоплення лише для VLC ---------- */
check('Визначення ключа джерела', /function sourceKey\(data\)/.test(src));
check('Гейт за вибором у Storage', /window\.Lampa\.Storage\.field\(key\) === CONFIG\.menuOption/.test(src));
check('Пропуск, якщо VLC не вибрано', /if \(!isVlcSelected\(data\)\)/.test(src));

/* ---------- 7.3. Етап 4.1: Debug Panel ---------- */
check('Заголовок ДІАГНОСТИКА ПЛЕЄРА', /ДІАГНОСТИКА ПЛЕЄРА/.test(src));
check('Стани українською',
    ['ІНІЦІАЛІЗАЦІЯ', 'ЗАВАНТАЖЕННЯ', 'ВІДТВОРЕННЯ', 'ПАУЗА', 'БУФЕРИЗАЦІЯ', 'ПОМИЛКА', 'ЗУПИНЕНО']
        .every(s => src.indexOf("'" + s + "'") > -1));
check('Джерела ПОСИЛАННЯ/TorrServer/IPTV/НЕВІДОМО',
    ['ПОСИЛАННЯ', 'TorrServer', 'IPTV', 'НЕВІДОМО'].every(s => src.indexOf("'" + s + "'") > -1));
check('Н/Д для недоступних показників', /'Н\/Д'/.test(src));
check('Позначка ОЦІНКА', /ОЦІНКА/.test(src));
check('Швидкість завантаження з Resource Timing', /ШВИДКІСТЬ ЗАВАНТАЖЕННЯ/.test(src) && /transferSize/.test(src) && /function createDownloadMeter/.test(src));
check('Формат відео / аудіодоріжки в панелі', /ФОРМАТ ВІДЕО/.test(src) && /АУДІОДОРІЖКИ/.test(src));
check('Метадані ffprobe без здогаду за URL', /function extractFfprobeMeta/.test(src) && /data\.ffprobe/.test(src));
check('Оцінка швидкості за буфером', /bufferRate/.test(src) && /с\/с \(ОЦІНКА\)/.test(src));
check('Панель не перехоплює кліки (pointer-events:none)', /\.vlc-debug\{[^}]*pointer-events:none/.test(src));
check('Реальні video.buffered / videoWidth / videoHeight',
    /buffered\(\)/.test(src) && /videoWidth/.test(src) && /videoHeight/.test(src));
check('Журнал подій обмежений', /CONFIG\.debugEvents/.test(src));
check('Видалення панелі разом із сесією', /s\.debug\.dispose\(\)/.test(src));

/* ---------- 7.4. Етап 4.2: Engine / Player Core ---------- */
check('Є ENGINE_CONTRACT', /var ENGINE_CONTRACT = \[/.test(src));
check('Є Html5Engine', /function Html5Engine\(hooks\)/.test(src));
check('Є EngineFactory', /var EngineFactory = \{/.test(src));
check('EngineFactory: tizen-avplay лише за наявності AVPlay, інакше html5',
    /if \(tizen && isAvplayAvailable\(\)\) return 'tizen-avplay';/.test(src) && /return 'html5';/.test(src));
check('EngineFactory.create через мапу рушіїв', /EngineFactory\.engines\[id\]/.test(src));
check('Player Core створює рушій через фабрику', /s\.engine = EngineFactory\.create\(hooks, s\)/.test(src));
check('Player Core монтує рушій через контракт', /s\.engine\.mount\(s\.ui\.root, s\.ui\.root\.firstChild\)/.test(src));
check('Player Core не звертається до engine.el', !/s\.engine\.el/.test(src));
check('Debug Panel бере ім’я рушія з engine.name', /dbg\(s, 'setEngine', s\.engine\.name/.test(src));
check('audioTracks повертає null без API', /if \(!list\) return null;/.test(src));
check('AVPlay: аудіометадані fourCC/channels/sample_rate', /fourCC/.test(src) && /sample_rate/.test(src) && /channels/.test(src));
check('AVPlay: активна доріжка через getCurrentStreamInfo', /getCurrentStreamInfo/.test(src));
check('Аудіо: активний вибір і збереження позиції', /setAudioActive/.test(src) && /Math\.abs\(after - before\) > 1\.5/.test(src));
check('setSubtitleDelay не фейкує підтримку', /setSubtitleDelay: function \(\) \{\s*return false;/.test(src));

/* ---------- 7.5. Етап 4.3: Tizen AVPlay ---------- */
check('Є TizenAvplayEngine', /function TizenAvplayEngine\(hooks\)/.test(src));
check('EngineFactory містить tizen-avplay', /'tizen-avplay': TizenAvplayEngine/.test(src));
check('Tizen визначається через Platform.is', /Platform\.is\('tizen'\)/.test(src));
check('Перевірка webapis.avplay', /window\.webapis && window\.webapis\.avplay/.test(src));
check('Немає визначення Tizen за User-Agent', !/userAgent[\s\S]{0,160}tizen/i.test(src));
check('AVPlay: <object type=application/avplayer>', /application\/avplayer/.test(src));
check('AVPlay: setDisplayRect 1920x1080', /setDisplayRect\(0, 0, 1920, 1080\)/.test(src));
check('AVPlay: prepareAsync + play', /prepareAsync\(function/.test(src) && /av\.play\(\)/.test(src));
check('AVPlay: setListener', /av\.setListener\(\{/.test(src));
check('AVPlay: setSelectTrack AUDIO/TEXT', /setSelectTrack\('AUDIO'/.test(src) && /setSelectTrack\('TEXT'/.test(src));
check('AVPlay: setSubtitlePosition', /setSubtitlePosition\(value\)/.test(src));
check('AVPlay: buffered() = 0 (N/A)', /не надає інтерфейсу buffered ranges[\s\S]{0,220}return 0;/.test(src));
check('Fallback AVPlay→HTML5', /function fallbackToHtml5/.test(src) && /EngineFactory\.create\(s\.hooks, s, 'html5'\)/.test(src));
check('Fallback одноразовий', /!s\.fallbackUsed/.test(src));

/* ---------- 8. Розмір ---------- */
const lines = src.split('\n').length;
check('Файл не порожній (>300 рядків)', lines > 300, lines + ' рядків');

/* ---------- Вивід ---------- */
let failed = 0;
results.forEach(r => {
    if (!r.ok) failed++;
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.extra ? '  [' + r.extra + ']' : ''));
});

console.log('\nSUMMARY passed=' + (results.length - failed) + ' failed=' + failed + ' total=' + results.length);
process.exit(failed ? 1 : 0);
