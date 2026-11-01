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
check('Кнопки play/back/fwd/settings/close',
    ['data-act="toggle"', 'data-act="back"', 'data-act="fwd"', 'data-act="settings"', 'data-act="close"']
        .every(s => src.indexOf(s) > -1));
check('Прогрес-бар з буфером і повзунком', /vlc-buffer/.test(src) && /vlc-thumb/.test(src));

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
