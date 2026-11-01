/*
 * Unit-тест логіки Етапу 4.1 у Node (без браузера).
 * Перевіряє меню (додавання опції, відсутність дублікатів, збереження default)
 * та гейт isVlcSelected/sourceKey. UI та Debug Panel тут не перевіряються —
 * для них є tests/harness.html.
 *
 * Запуск: node tests/menu-unit.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const results = [];

function check(name, condition, extra) {
    results.push({ name, ok: !!condition, extra: extra === undefined ? '' : String(extra) });
}

/* ---------- Мінімальні заглушки середовища ---------- */

const storageData = {};

function makeListener() {
    return {
        handlers: {},
        follow(type, fn) { this.handlers[type] = fn; return this; },
        send(type, event) { if (this.handlers[type]) this.handlers[type](event || {}); },
        remove() { return this; }
    };
}

const Params = {
    values: {
        player: { inner: 'Вбудований' },
        player_torrent: { inner: 'Вбудований' },
        player_iptv: { inner: 'Вбудований' }
    },
    defaults: {
        player: 'inner',
        player_torrent: 'inner',
        player_iptv: 'inner'
    },
    select(name, values, def) {
        this.values[name] = values;
        this.defaults[name] = def;
    }
};

const Lampa = {
    Listener: makeListener(),
    Player: { listener: makeListener() },
    Params,
    Controller: { enabled() { return { name: 'content' }; }, toggle() {} },
    Storage: {
        get(key, def) { return key in storageData ? storageData[key] : def; },
        set(key, value) { storageData[key] = value; },
        field(name) { return this.get(name, Params.defaults[name]); }
    },
    Torserver: { toPlayUrl(url) { return String(url).replace('&preload', '&play'); } },
    Timeline: { update() {} },
    Background: { theme() {} }
};

const styleNode = {
    id: '',
    type: '',
    appendChild() {},
    setAttribute() {}
};

global.window = global;
global.console = console;
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
global.setInterval = setInterval;
global.clearInterval = clearInterval;

global.document = {
    createElement(tag) {
        if (tag === 'style') return styleNode;
        return { style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} };
    },
    createTextNode() { return {}; },
    getElementById() { return null; },
    head: { appendChild() {} },
    body: { appendChild() {}, classList: { add() {}, remove() {} }, style: {} },
    querySelector() { return null; }
};

global.window.location = { search: '' };
global.window.appready = true;
global.window.Lampa = Lampa;

/* ---------- Завантаження плагіна ---------- */

const source = fs.readFileSync(path.join(__dirname, '..', 'Lampa-VLC-Player.js'), 'utf8');
vm.runInThisContext(source, { filename: 'Lampa-VLC-Player.js' });

const api = global.window.__lampaVlcPlayer;

/* ---------- Тести меню ---------- */

check('Плагін ініціалізовано', !!(api && api.isReady && api.isReady()), api ? api.version : 'no api');

check('Опція vlc додана в player', Params.values.player.vlc === 'VLC Player');
check('Опція vlc додана в player_torrent', Params.values.player_torrent.vlc === 'VLC Player');
check('Опція vlc додана в player_iptv', Params.values.player_iptv.vlc === 'VLC Player');

const before = Object.keys(Params.values.player).length;
api.menu.apply();
api.menu.apply();
const after = Object.keys(Params.values.player).length;

check('Повторний apply не додає дублікатів', before === after && after === 2, before + '→' + after);
check('Наявні опції збережені', Params.values.player.inner === 'Вбудований');
check('Default не змінено (player)', Params.defaults.player === 'inner', Params.defaults.player);
check('Default не змінено (player_torrent)', Params.defaults.player_torrent === 'inner');
check('Default не змінено (player_iptv)', Params.defaults.player_iptv === 'inner');
check('Є метод ПК-розділу налаштувань', typeof api.menu.addBrowserSection === 'function');

/* ---------- Тести гейта ---------- */

storageData.player = 'inner';
check('player=inner → не перехоплюємо', api.isVlcSelected({}) === false);
check('sourceKey звичайного відео', api.sourceKey({}) === 'player');

storageData.player = 'vlc';
check('player=vlc → перехоплюємо', api.isVlcSelected({}) === true);

storageData.player = 'inner';
storageData.player_torrent = 'vlc';
check('Торент: ключ player_torrent', api.sourceKey({ torrent_hash: 'abc' }) === 'player_torrent');
check('Торент: player_torrent=vlc → перехоплюємо', api.isVlcSelected({ torrent_hash: 'abc' }) === true);
check('Звичайне відео при player=inner не перехоплюється', api.isVlcSelected({}) === false);

storageData.player_torrent = 'inner';
check('Торент при player_torrent=inner не перехоплюється', api.isVlcSelected({ torrent_hash: 'abc' }) === false);

/* ---------- Вивід ---------- */

let failed = 0;
results.forEach(r => {
    if (!r.ok) failed++;
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.extra ? '  [' + r.extra + ']' : ''));
});

console.log('\nSUMMARY passed=' + (results.length - failed) + ' failed=' + failed + ' total=' + results.length);
process.exit(failed ? 1 : 0);
