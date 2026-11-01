/*
 * Unit-тест контракту рушія (Етап 4.2) у Node.
 * Перевіряє Html5Engine: наявність усіх методів ENGINE_CONTRACT, базові
 * операції, треки, помилки, очищення та відсутність витоків обробників.
 * UI, Player Core і Debug Panel тут не перевіряються — для них є harness.html.
 *
 * Запуск: node tests/engine-unit.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const results = [];

function check(name, condition, extra) {
    results.push({ name, ok: !!condition, extra: extra === undefined ? '' : String(extra) });
}

/* ---------- Мінімальний DOM ---------- */

class FakeVideo {
    constructor() {
        this.tagName = 'VIDEO';
        this.listeners = {};
        this.attributes = {};
        this.src = '';
        this.currentTime = 0;
        this.duration = NaN;
        this.paused = true;
        this.playbackRate = 1;
        this.videoWidth = 0;
        this.videoHeight = 0;
        this.buffered = { length: 0, start() { return 0; }, end() { return 0; } };
        this.parentNode = null;
        this.error = null;
        this.loadCalls = 0;
        this.playCalls = 0;
        this.pauseCalls = 0;
    }

    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
    removeAttribute(name) { delete this.attributes[name]; }

    addEventListener(type, fn) {
        (this.listeners[type] = this.listeners[type] || []).push(fn);
    }

    removeEventListener(type, fn) {
        const list = this.listeners[type] || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
    }

    dispatchEvent(event) {
        (this.listeners[event.type] || []).slice(0).forEach(fn => fn(event));
        return true;
    }

    play() {
        this.playCalls++;
        this.paused = false;
        this.dispatchEvent({ type: 'play' });
        return Promise.resolve();
    }

    pause() {
        this.pauseCalls++;
        this.paused = true;
        this.dispatchEvent({ type: 'pause' });
    }

    load() { this.loadCalls++; }
}

function makeContainer() {
    return {
        children: [],
        appendChild(node) {
            node.parentNode = this;
            this.children.push(node);
            return node;
        },
        insertBefore(node, before) {
            node.parentNode = this;
            const i = this.children.indexOf(before);
            if (i >= 0) this.children.splice(i, 0, node);
            else this.children.push(node);
            return node;
        },
        removeChild(node) {
            const i = this.children.indexOf(node);
            if (i >= 0) this.children.splice(i, 1);
            node.parentNode = null;
        }
    };
}

const styleNode = { id: '', type: '', appendChild() {}, setAttribute() {} };

global.window = global;
global.console = console;
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
global.setInterval = setInterval;
global.clearInterval = clearInterval;

global.document = {
    createElement(tag) {
        if (tag === 'video') return new FakeVideo();
        if (tag === 'style') return styleNode;
        return { style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} };
    },
    createTextNode() { return {}; },
    getElementById() { return null; },
    head: { appendChild() {} },
    body: { appendChild() {}, classList: { add() {}, remove() {} }, style: {} },
    querySelector() { return null; }
};

function makeListener() {
    return {
        handlers: {},
        follow(type, fn) { this.handlers[type] = fn; return this; },
        send(type, event) { if (this.handlers[type]) this.handlers[type](event || {}); },
        remove() { return this; }
    };
}

const Params = {
    values: { player: { inner: 'Вбудований' }, player_torrent: { inner: 'Вбудований' }, player_iptv: { inner: 'Вбудований' } },
    defaults: { player: 'inner', player_torrent: 'inner', player_iptv: 'inner' },
    select(name, values, def) { this.values[name] = values; this.defaults[name] = def; }
};

const storageData = {};

global.window.location = { search: '' };
global.window.appready = true;
global.window.Lampa = {
    Listener: makeListener(),
    Player: { listener: makeListener() },
    Params,
    Controller: { enabled() { return { name: 'content' }; }, toggle() {} },
    Storage: {
        get(key, def) { return key in storageData ? storageData[key] : def; },
        set(key, value) { storageData[key] = value; },
        field(name) { return this.get(name, Params.defaults[name]); }
    },
    Torserver: { toPlayUrl(url) { return String(url); } },
    Timeline: { update() {} },
    Background: { theme() {} }
};

/* ---------- Завантаження плагіна ---------- */

const source = fs.readFileSync(path.join(__dirname, '..', 'Lampa-VLC-Player.js'), 'utf8');
vm.runInThisContext(source, { filename: 'Lampa-VLC-Player.js' });

const api = global.window.__lampaVlcPlayer;
const internals = api && api._internals;

check('Плагін ініціалізовано', !!(api && api.isReady()), api ? api.version : 'no api');
check('EngineFactory доступний', !!(internals && internals.EngineFactory));
check('Html5Engine доступний', typeof (internals && internals.Html5Engine) === 'function');
check('ENGINE_CONTRACT — масив', Array.isArray(internals && internals.ENGINE_CONTRACT));

/* ---------- Створення рушія ---------- */

const hooks = {
    meta: 0, time: 0, progress: 0, playing: 0, playState: 0,
    waiting: 0, ended: 0, error: 0, rate: 0, blocked: 0,
    onMeta() { this.meta++; },
    onTime() { this.time++; },
    onProgress() { this.progress++; },
    onPlaying() { this.playing++; },
    onPlayState() { this.playState++; },
    onWaiting() { this.waiting++; },
    onEnded() { this.ended++; },
    onError(code) { this.error = code; },
    onRate() { this.rate++; },
    onAutoplayBlocked() { this.blocked++; }
};

const engine = internals.Html5Engine(hooks);

check('Рушій має ім’я HTML5', engine.name === 'HTML5', engine.name);
check('capabilities() повертає об’єкт', !!engine.capabilities() && typeof engine.capabilities().audioTracks === 'boolean');

internals.ENGINE_CONTRACT.forEach(method => {
    check('Метод контракту: ' + method, typeof engine[method] === 'function');
});

/* ---------- mount / load / play / pause ---------- */

const container = makeContainer();
const before = { parentNode: container };
container.children.push(before);
before.parentNode = container;

engine.mount(container, before);

check('mount вставляє відео перед вказаним вузлом', container.children[0] === engine.el);
check('mount встановлює parentNode', engine.el.parentNode === container);

engine.load('http://example.test/video.mp4');

check('load встановлює src', engine.el.src === 'http://example.test/video.mp4', engine.el.src);
check('load зберігає data-src', engine.el.getAttribute('data-src') === 'http://example.test/video.mp4');
check('load викликає video.load()', engine.el.loadCalls >= 1, engine.el.loadCalls);
check('load запускає відтворення', engine.el.playCalls >= 1 && engine.el.paused === false);

engine.pause();
check('pause зупиняє відтворення', engine.el.paused === true);
engine.play();
check('play відновлює відтворення', engine.el.paused === false);
engine.toggle();
check('toggle перемикає на паузу', engine.el.paused === true);
engine.toggle();
check('toggle повертає відтворення', engine.el.paused === false);

/* ---------- seek / rate / time / duration / buffer ---------- */

engine.el.duration = 100;
engine.el.currentTime = 0;

engine.seek(150);
check('seek обмежує значення duration', engine.el.currentTime === 100, engine.el.currentTime);

engine.seek(-5);
check('seek не допускає від’ємний час', engine.el.currentTime === 0, engine.el.currentTime);

engine.seekBy(30);
check('seekBy перемотує вперед', engine.el.currentTime === 30, engine.el.currentTime);

engine.setRate(1.5);
check('setRate змінює playbackRate', engine.el.playbackRate === 1.5);
check('rate() повертає поточну швидкість', engine.rate() === 1.5);

engine.el.currentTime = 12;
engine.el.duration = 100;
engine.el.buffered = { length: 1, start() { return 0; }, end() { return 40; } };

check('time() повертає поточний час', engine.time() === 12, engine.time());
check('duration() повертає тривалість', engine.duration() === 100);
check('buffered() повертає кінець діапазону', engine.buffered() === 40, engine.buffered());

engine.el.videoWidth = 1920;
engine.el.videoHeight = 1080;
const size = engine.videoSize();
check('videoSize() повертає роздільність', size.width === 1920 && size.height === 1080);

/* ---------- Дорожки ---------- */

check('audioTracks() без API → null', engine.audioTracks() === null);

engine.el.audioTracks = [
    { label: 'Українська', language: 'uk', enabled: true },
    { label: 'English', language: 'en', enabled: false }
];

const audio = engine.audioTracks();
check('audioTracks() повертає реальні доріжки', Array.isArray(audio) && audio.length === 2, audio ? audio.length : 'null');
check('selectAudio(1) перемикає доріжку', engine.selectAudio(1) === true && engine.el.audioTracks[1].enabled === true);
check('selectAudio(1) вимикає інші', engine.el.audioTracks[0].enabled === false);
check('selectAudio(5) повертає false', engine.selectAudio(5) === false);

check('subtitleTracks() без доріжок → []', Array.isArray(engine.subtitleTracks()) && engine.subtitleTracks().length === 0);

engine.el.textTracks = [
    { label: 'Українські', language: 'uk', mode: 'disabled' },
    { label: 'English', language: 'en', mode: 'disabled' }
];

check('selectSubtitle(0) вмикає субтитри', engine.selectSubtitle(0) === true && engine.el.textTracks[0].mode === 'showing');
check('selectSubtitle(0) вимикає інші', engine.el.textTracks[1].mode === 'disabled');
check('selectSubtitle(3) повертає false', engine.selectSubtitle(3) === false);
check('setSubtitleDelay не підтримується → false', engine.setSubtitleDelay(500) === false);

/* ---------- Події ---------- */

engine.el.dispatchEvent({ type: 'loadedmetadata' });
check('loadedmetadata → hooks.onMeta', hooks.meta === 1, hooks.meta);

engine.el.dispatchEvent({ type: 'timeupdate' });
check('timeupdate → hooks.onTime', hooks.time === 1, hooks.time);

engine.el.dispatchEvent({ type: 'progress' });
check('progress → hooks.onProgress', hooks.progress === 1, hooks.progress);

engine.el.error = { code: 4 };
engine.el.dispatchEvent({ type: 'error' });
check('error code 4 → hooks.onError(4)', hooks.error === 4, hooks.error);

/* ---------- Destroy ---------- */

const destroyedEl = engine.el;
engine.destroy();

check('destroy прибирає src', destroyedEl.getAttribute('src') === null);
check('destroy прибирає data-src', destroyedEl.getAttribute('data-src') === null);
check('destroy викликає video.load()', destroyedEl.loadCalls >= 2, destroyedEl.loadCalls);
check('destroy видаляє відео з DOM', destroyedEl.parentNode === null);
check('destroy знімає всі обробники', Object.keys(destroyedEl.listeners).every(k => destroyedEl.listeners[k].length === 0));
check('destroy обнуляє посилання на елемент', engine.el === null);

/* ---------- Ізоляція двох рушіїв ---------- */

const hooks2 = { meta: 0, onMeta() { this.meta++; }, onTime() {}, onProgress() {}, onPlaying() {}, onPlayState() {}, onWaiting() {}, onEnded() {}, onError() {}, onRate() {}, onAutoplayBlocked() {} };
const engine2 = internals.Html5Engine(hooks2);
engine2.load('http://example.test/second.mp4');

check('Другий рушій має власний елемент', engine2.el !== null);
check('Події другого рушія не впливають на перший', hooks.meta === 1, hooks.meta);

engine2.destroy();

/* ---------- Вивід ---------- */

let failed = 0;
results.forEach(r => {
    if (!r.ok) failed++;
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.extra ? '  [' + r.extra + ']' : ''));
});

console.log('\nSUMMARY passed=' + (results.length - failed) + ' failed=' + failed + ' total=' + results.length);
process.exit(failed ? 1 : 0);
