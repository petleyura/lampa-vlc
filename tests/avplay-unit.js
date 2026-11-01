/*
 * Unit-тест TizenAvplayEngine (Етап 4.3) у Node з керованою заглушкою
 * webapis.avplay. Це НЕ підтверджує роботу на реальному Samsung TV:
 * перевіряється лише логіка адаптера, життєвий цикл і мапінг подій.
 *
 * Запуск: node tests/avplay-unit.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const results = [];

function check(name, condition, extra) {
    results.push({ name, ok: !!condition, extra: extra === undefined ? '' : String(extra) });
}

/* ---------- DOM-заглушки ---------- */

class FakeObject {
    constructor() {
        this.tagName = 'OBJECT';
        this.className = '';
        this.attributes = {};
        this.parentNode = null;
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] === undefined ? null : this.attributes[name]; }
    removeAttribute(name) { delete this.attributes[name]; }
}

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
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] === undefined ? null : this.attributes[name]; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    removeEventListener(type, fn) {
        const list = this.listeners[type] || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
    }
    dispatchEvent(event) {
        (this.listeners[event.type] || []).slice(0).forEach(fn => fn(event));
        return true;
    }
    play() { this.paused = false; this.dispatchEvent({ type: 'play' }); return Promise.resolve(); }
    pause() { this.paused = true; this.dispatchEvent({ type: 'pause' }); }
    load() {}
}

function makeContainer() {
    return {
        children: [],
        appendChild(node) { node.parentNode = this; this.children.push(node); return node; },
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
global.addEventListener = function () {};
global.removeEventListener = function () {};

global.document = {
    createElement(tag) {
        if (tag === 'video') return new FakeVideo();
        if (tag === 'object') return new FakeObject();
        if (tag === 'style') return styleNode;
        return { style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} };
    },
    createTextNode() { return {}; },
    getElementById() { return null; },
    head: { appendChild() {} },
    body: { appendChild() {}, classList: { add() {}, remove() {} }, style: {} },
    querySelector() { return null; }
};

/* ---------- Керована заглушка AVPlay ---------- */

class FakeAvplay {
    constructor() {
        this.calls = [];
        this.state = 'NONE';
        this.listener = null;
        this.duration = 120000;
        this.current = 0;
        this.failOpen = false;
        this.failPrepare = false;
        this.failPlay = false;
        this.tracks = [
            { type: 'AUDIO', index: 0, extra_info: JSON.stringify({ language: 'uk', channels: 2 }) },
            { type: 'AUDIO', index: 1, extra_info: JSON.stringify({ language: 'en', channels: 6 }) },
            { type: 'TEXT', index: 2, extra_info: JSON.stringify({ track_lang: 'en' }) }
        ];
    }

    open(url) {
        this.calls.push(['open', url]);
        if (this.failOpen) throw new Error('open boom');
        this.state = 'IDLE';
    }
    setListener(listener) { this.calls.push(['setListener']); this.listener = listener; }
    setDisplayRect(x, y, w, h) { this.calls.push(['setDisplayRect', x, y, w, h]); }
    setDisplayMethod(mode) { this.calls.push(['setDisplayMethod', mode]); }

    prepareAsync(success, error) {
        this.calls.push(['prepareAsync']);
        if (this.failPrepare) { error({ message: 'prepare boom' }); return; }
        this.state = 'READY';
        success();
    }

    play() {
        this.calls.push(['play']);
        if (this.failPlay) throw new Error('play boom');
        this.state = 'PLAYING';
    }

    pause() { this.calls.push(['pause']); this.state = 'PAUSED'; }
    stop() { this.calls.push(['stop']); this.state = 'IDLE'; }
    close() { this.calls.push(['close']); this.state = 'NONE'; }

    seekTo(ms) { this.calls.push(['seekTo', ms]); this.current = ms; }
    getDuration() { return this.duration; }
    getCurrentTime() { return this.current; }
    setSpeed(value) { this.calls.push(['setSpeed', value]); }
    getTotalTrackInfo() { return this.tracks; }
    getCurrentStreamInfo() {
        return [{ type: 'VIDEO', extra_info: JSON.stringify({ width: 1920, height: 1080 }) }];
    }
    setSelectTrack(type, index) { this.calls.push(['setSelectTrack', type, index]); }
    setSubtitlePosition(ms) { this.calls.push(['setSubtitlePosition', ms]); }

    emit(event, data) {
        if (this.listener && typeof this.listener[event] === 'function') this.listener[event](data);
    }
}

const fakeAv = new FakeAvplay();
let tizen = true;

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
global.window.webapis = { avplay: fakeAv };
global.window.Lampa = {
    Listener: makeListener(),
    Player: { listener: makeListener() },
    Params,
    Platform: {
        is(type) { return type === 'tizen' ? tizen : false; }
    },
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
const internals = api._internals;

/* ---------- Визначення платформи ---------- */

check('isAvplayAvailable() === true із заглушкою', internals.isAvplayAvailable() === true);
check('platformId() = tizen-avplay', internals.EngineFactory.platformId() === 'tizen-avplay');

tizen = false;
check('Без Tizen — platformId() = html5 навіть із AVPlay', internals.EngineFactory.platformId() === 'html5');
tizen = true;

const savedAv = global.window.webapis.avplay;
global.window.webapis.avplay = null;
check('Без webapis.avplay — isAvplayAvailable() === false', internals.isAvplayAvailable() === false);
check('Без webapis.avplay — platformId() = html5', internals.EngineFactory.platformId() === 'html5');
global.window.webapis.avplay = savedAv;

/* ---------- Створення та життєвий цикл ---------- */

function makeHooks() {
    return {
        meta: 0, time: 0, progress: 0, playing: 0, playState: 0,
        waiting: 0, ended: 0, error: 0, errorText: '', rate: 0,
        onMeta() { this.meta++; },
        onTime() { this.time++; },
        onProgress() { this.progress++; },
        onPlaying() { this.playing++; },
        onPlayState() { this.playState++; },
        onWaiting() { this.waiting++; },
        onEnded() { this.ended++; },
        onError(code, text) { this.error = code; this.errorText = text || ''; },
        onRate() { this.rate++; },
        onAutoplayBlocked() {}
    };
}

const hooks = makeHooks();
const engine = internals.TizenAvplayEngine(hooks);
const container = makeContainer();

check('Ім’я рушія — Tizen AVPlay', engine.name === 'Tizen AVPlay', engine.name);

const contract = internals.ENGINE_CONTRACT;
const missing = contract.filter(method => typeof engine[method] !== 'function');
check('Реалізовано весь ENGINE_CONTRACT', missing.length === 0, missing.join(','));

engine.mount(container, null);
check('mount створює <object type="application/avplayer">',
    engine.el.tagName === 'OBJECT' && engine.el.getAttribute('type') === 'application/avplayer');

fakeAv.calls = [];
engine.load('http://192.168.1.10:8090/stream/x.mkv?link=h&index=1&play');

check('load викликає open(url)', fakeAv.calls.some(c => c[0] === 'open' && c[1].indexOf('/stream/') > -1));
check('load викликає setListener', fakeAv.calls.some(c => c[0] === 'setListener'));
check('load викликає setDisplayRect', fakeAv.calls.some(c => c[0] === 'setDisplayRect'));
check('load викликає prepareAsync', fakeAv.calls.some(c => c[0] === 'prepareAsync'));
check('після prepareAsync викликано play', fakeAv.calls.some(c => c[0] === 'play'));
check('hooks.onMeta викликано після prepare', hooks.meta === 1, hooks.meta);
check('hooks.onPlaying викликано після play', hooks.playing === 1, hooks.playing);

check('time() = 0 на старті', engine.time() === 0);
check('duration() = 120 с', engine.duration() === 120, engine.duration());
check('buffered() = 0 (AVPlay не має buffered ranges)', engine.buffered() === 0);

/* ---------- Керування ---------- */

engine.pause();
check('pause → стан PAUSED', fakeAv.calls.some(c => c[0] === 'pause') && engine.paused() === true);

engine.play();
check('play після pause → PLAYING', engine.paused() === false);

engine.toggle();
check('toggle ставить на паузу', engine.paused() === true);
engine.toggle();
check('toggle відновлює відтворення', engine.paused() === false);

fakeAv.calls = [];
engine.seek(30);
check('seek(30) → seekTo(30000)', fakeAv.calls.some(c => c[0] === 'seekTo' && c[1] === 30000));

check('setRate(2) → setSpeed(2)', engine.setRate(2) === true && fakeAv.calls.some(c => c[0] === 'setSpeed' && c[1] === 2));

/* ---------- Дорожки ---------- */

const audio = engine.audioTracks();
check('audioTracks() повертає 2 доріжки', Array.isArray(audio) && audio.length === 2, audio ? audio.length : 'null');
check('audioTracks() має мову uk', audio && audio[0].language === 'uk', audio ? audio[0].language : '');

fakeAv.calls = [];
check('selectAudio(1) викликає setSelectTrack', engine.selectAudio(1) === true &&
    fakeAv.calls.some(c => c[0] === 'setSelectTrack' && c[1] === 'AUDIO' && c[2] === 1));
check('selectAudio(9) → false', engine.selectAudio(9) === false);

const subs = engine.subtitleTracks();
check('subtitleTracks() повертає 1 доріжку', Array.isArray(subs) && subs.length === 1, subs ? subs.length : 'null');

fakeAv.calls = [];
check('selectSubtitle(2) викликає setSelectTrack(TEXT)', engine.selectSubtitle(2) === true &&
    fakeAv.calls.some(c => c[0] === 'setSelectTrack' && c[1] === 'TEXT' && c[2] === 2));
check('setSubtitleDelay(500) → setSubtitlePosition', engine.setSubtitleDelay(500) === true &&
    fakeAv.calls.some(c => c[0] === 'setSubtitlePosition' && c[1] === 500));

/* ---------- Відсутність track API ---------- */

const savedTrackApi = {
    getTotalTrackInfo: fakeAv.getTotalTrackInfo,
    setSelectTrack: fakeAv.setSelectTrack
};

fakeAv.getTotalTrackInfo = undefined;
fakeAv.setSelectTrack = undefined;

check('Без track API capabilities().audioTracks === false', engine.capabilities().audioTracks === false);
check('Без track API audioTracks() === null', engine.audioTracks() === null);

fakeAv.getTotalTrackInfo = savedTrackApi.getTotalTrackInfo;
fakeAv.setSelectTrack = savedTrackApi.setSelectTrack;

/* ---------- Відеорозмір ---------- */

const size = engine.videoSize();
check('videoSize() з getCurrentStreamInfo', size.width === 1920 && size.height === 1080, size.width + 'x' + size.height);

/* ---------- Події ---------- */

hooks.waiting = 0;
fakeAv.emit('onbufferingstart');
fakeAv.emit('onbufferingcomplete');
check('buffering start/complete → hooks.onWaiting', hooks.waiting === 2, hooks.waiting);

hooks.time = 0;
fakeAv.emit('oncurrentplaytime', 5000);
check('oncurrentplaytime → hooks.onTime', hooks.time === 1, hooks.time);

hooks.ended = 0;
fakeAv.emit('onstreamcompleted');
check('onstreamcompleted → hooks.onEnded', hooks.ended === 1, hooks.ended);

/* ---------- Помилка ---------- */

hooks.error = 0;
fakeAv.emit('onerror', 'PLAYER_ERROR');
check('onerror → hooks.onError(105)', hooks.error === 105, hooks.error);

/* ---------- Destroy ---------- */

fakeAv.calls = [];
engine.destroy();

check('destroy викликає stop/close', fakeAv.calls.some(c => c[0] === 'stop') && fakeAv.calls.some(c => c[0] === 'close'));
check('destroy видаляє <object> з DOM', container.children.length === 0);

/* ---------- Повторне створення ---------- */

const hooks2 = makeHooks();
const engine2 = internals.TizenAvplayEngine(hooks2);
const container2 = makeContainer();

engine2.mount(container2, null);
engine2.load('http://example.test/second.mkv');

check('Повторна сесія створює новий рушій', engine2.name === 'Tizen AVPlay' && container2.children.length === 1);
check('Повторна сесія не зламала перший об’єкт', container.children.length === 0);

/* ---------- Fallback на HTML5 ---------- */

const fallbackHooks = makeHooks();
const fallbackSession = {
    url: 'http://example.test/fallback.mp4',
    hooks: fallbackHooks,
    engine: engine2,
    ui: { root: makeContainer() },
    debug: null,
    fallbackUsed: false,
    debugState: '',
    speedMeter: { reset() {}, sample() { return null; } }
};

fallbackSession.ui.root.appendChild(fallbackSession.engine.el);

const fallbackResult = internals.fallbackToHtml5(fallbackSession, 'open failed');

check('fallbackToHtml5 повертає true', fallbackResult === true);
check('fallback замінює рушій на HTML5', fallbackSession.engine.name === 'HTML5', fallbackSession.engine.name);
check('fallback позначає сесію', fallbackSession.fallbackUsed === true);
check('fallback встановлює URL у HTML5', fallbackSession.engine.el.src === 'http://example.test/fallback.mp4');
check('fallback монтує відео в контейнер', fallbackSession.ui.root.children.length > 0);

fallbackSession.engine.destroy();

/* ---------- Вивід ---------- */

let failed = 0;
results.forEach(r => {
    if (!r.ok) failed++;
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.extra ? '  [' + r.extra + ']' : ''));
});

console.log('\nSUMMARY passed=' + (results.length - failed) + ' failed=' + failed + ' total=' + results.length);
process.exit(failed ? 1 : 0);
