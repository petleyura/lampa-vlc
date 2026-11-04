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
check('AudioSyncEngine доступний', typeof (internals && internals.AudioSyncEngine) === 'function');
check('ENGINE_CONTRACT — масив', Array.isArray(internals && internals.ENGINE_CONTRACT));

/* ---------- AudioSync: вибір для torrent + WebAudio ---------- */
var savedAudioContext = global.window.AudioContext;
global.window.AudioContext = function () {
    this.state = 'running';
    this.resume = function () { return Promise.resolve(); };
    this.close = function () { return Promise.resolve(); };
    this.createBufferSource = function () { return {}; };
    this.currentTime = 0;
    this.destination = {};
};

var audioSession = { data: { torrent_hash: 'abc' }, mediaMeta: null };
var audioEngine = internals.EngineFactory.create({}, audioSession);
check('AudioSync обрано для torrent у WebAudio-середовищі', audioEngine.name === 'HTML5 + AudioSync', audioEngine.name);
check('AudioSync має audioDebug', audioEngine.audioDebug() && audioEngine.audioDebug().active === false);
check('AudioSync не активний без метаданих', audioEngine.audioDebug().audioEngine === 'HTML5');
check('AudioSync має watchdog-стан', audioEngine.audioDebug().contextState === 'none' &&
    audioEngine.audioDebug().activeSources === 0 &&
    audioEngine.audioDebug().fallback === false &&
    audioEngine.audioDebug().recoveryAttempted === false);
check('AudioSync має seek/track-стан', audioEngine.audioDebug().pendingAudioSelection === null &&
    audioEngine.audioDebug().seekActive === false &&
    audioEngine.audioDebug().startRequestId === 0);
check('AudioSync не має зайвих sink/iterator', audioEngine.audioDebug().sinkCount === 0 &&
    audioEngine.audioDebug().iteratorCount === 0);
check('AudioSync underrun-лічильники', audioEngine.audioDebug().underruns === 0 &&
    audioEngine.audioDebug().underrunAttempts === 0 &&
    audioEngine.audioDebug().underrunSuccess === 0 &&
    audioEngine.audioDebug().underrunFailures === 0);
check('AudioSync HTTP-діагностика', audioEngine.audioDebug().rangeRequests === 0 &&
    audioEngine.audioDebug().lastHttpStatus === 0 &&
    audioEngine.audioDebug().errorKind === '');
check('AudioSync H1/H2 стан', audioEngine.audioDebug().transportRetries === 0 &&
    audioEngine.audioDebug().preparing === false);

var forcedHtml5 = internals.EngineFactory.create({}, audioSession, 'html5');
check('Примусовий html5 не перекривається AudioSync', forcedHtml5.name === 'HTML5', forcedHtml5.name);

global.window.AudioContext = savedAudioContext;

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
check('selectAudio не змінює позицію відео', engine.el.currentTime === 12, engine.el.currentTime);

engine.el.currentTime = 42;
check('selectAudio(0) зберігає позицію', engine.selectAudio(0) === true && engine.el.currentTime === 42);

check('audioTracks() з порожнім API → []', (function () {
    engine.el.audioTracks = [];
    var empty = engine.audioTracks();
    return Array.isArray(empty) && empty.length === 0;
})());

engine.el.audioTracks = [
    { label: 'Українська', language: 'uk', enabled: true },
    { label: 'English', language: 'en', enabled: false }
];
var audioView = engine.audioTracks()[0];
check('audioTracks() повертає номер/мову/назву', audioView.index === 0 && audioView.language === 'uk' && audioView.title === 'Українська', JSON.stringify(audioView));

check('audioTracks() при помилці API → null', (function () {
    var saved = engine.el.audioTracks;
    Object.defineProperty(engine.el, 'audioTracks', {
        configurable: true,
        get: function () { throw new Error('boom'); }
    });
    var broken = engine.audioTracks();
    Object.defineProperty(engine.el, 'audioTracks', { configurable: true, value: saved });
    return broken === null;
})());

var view = internals.audioTrackView({
    index: 1,
    label: 'English',
    language: 'en',
    codec: 'AC3',
    channels: 6,
    sampleRate: 48000,
    enabled: true
}, 0);
check('audioTrackView: кодек/канали/частота', view.codec === 'AC-3' && view.channels === '5.1' && view.sampleRate === '48000 Гц',
    JSON.stringify(view));
check('audioTrackView: номер і активність', view.number === 1 && view.enabled === true);

function fakeAudioSession(selectResult) {
    var state = { active: null, status: '', error: false, seeks: 0 };

    return {
        state: state,
        session: {
            engine: {
                audioTracks: function () {
                    return [
                        { index: 0, label: 'Українська', language: 'uk', enabled: true },
                        { index: 1, label: 'English', language: 'en', enabled: false }
                    ];
                },
                selectAudio: function () { return selectResult; },
                time: function () { return 10; },
                seek: function () { state.seeks++; }
            },
            ui: {
                clearAudio: function () {},
                renderAudio: function () {},
                setAudioStatus: function (text, error) { state.status = text; state.error = !!error; },
                setAudioActive: function (index) { state.active = index; }
            }
        }
    };
}

var audioOk = fakeAudioSession(true);
check('selectAudioTrack: успішне перемикання', internals.selectAudioTrack(audioOk.session, 1) === true &&
    audioOk.state.active === 1 && audioOk.state.error === false, JSON.stringify(audioOk.state));

var audioFail = fakeAudioSession(false);
check('selectAudioTrack: помилка рушія', internals.selectAudioTrack(audioFail.session, 1) === false &&
    audioFail.state.error === true && audioFail.state.status.indexOf('Не вдалося') > -1);

/* ---------- Метадані та швидкість завантаження ---------- */

var ffprobe = internals.extractFfprobeMeta({
    ffprobe: {
        format: { format_name: 'matroska,webm', bit_rate: '8000000' },
        streams: [
            { codec_type: 'video', codec_name: 'hevc', width: 1920, height: 1080, r_frame_rate: '24000/1001' },
            { codec_type: 'audio', index: 1, codec_name: 'eac3', channels: 6, sample_rate: '48000', tags: { language: 'en', title: 'English' }, disposition: { default: 1 } }
        ]
    }
});
check('ffprobe: контейнер MKV', ffprobe.container === 'MKV', ffprobe.container);
check('ffprobe: відеокодек HEVC', ffprobe.codec === 'HEVC', ffprobe.codec);
check('ffprobe: FPS 23.976', Math.abs(ffprobe.fps - 23.976) < 0.001, ffprobe.fps);
check('ffprobe: аудіокодек E-AC-3/5.1/48000', ffprobe.audio[0].codec === 'E-AC-3' &&
    ffprobe.audio[0].channels === 6 && ffprobe.audio[0].sampleRate === '48000');

check('ffprobe відсутній → null', internals.extractFfprobeMeta({}) === null);

/* ---------- TorrServer /ffp → mediaMeta ---------- */
var savedTorserver = global.window.Lampa.Torserver;
var savedReguest = global.window.Lampa.Reguest;

global.window.Lampa.Torserver = { url: function () { return 'http://torrserver:8090'; } };
global.window.Lampa.Reguest = function () {
    this.timeout = function () {};
    this.silent = function (url, success) {
        this.url = url;
        success({
            format: { format_name: 'matroska,webm', bit_rate: '8000000' },
            streams: [
                { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '24/1' },
                { codec_type: 'audio', index: 1, codec_name: 'ac3', channels: 2, sample_rate: '48000', tags: { language: 'uk' } }
            ]
        });
    };
};

var probeSession = { data: { torrent_hash: 'abc', id: 3 }, destroying: false, mediaMeta: null, probeStarted: false, debug: null, ui: null };
internals.probeTorrentMetadata(probeSession);
check('TorrServer /ffp: контейнер/кодек', probeSession.mediaMeta && probeSession.mediaMeta.container === 'MKV' &&
    probeSession.mediaMeta.codec === 'H.264', JSON.stringify(probeSession.mediaMeta));
check('TorrServer /ffp: аудіодоріжка AC-3', probeSession.mediaMeta && probeSession.mediaMeta.audio[0].codec === 'AC-3' &&
    probeSession.mediaMeta.audio[0].language === 'uk', JSON.stringify(probeSession.mediaMeta && probeSession.mediaMeta.audio));

/* /ffp: перша помилка → одна відкладена повторна спроба → success */
var savedSetTimeout = global.setTimeout;
var retryCallbacks = [];
global.setTimeout = function (fn, ms) {
    if (ms >= 500) {
        retryCallbacks.push(fn);
        return 1;
    }
    return savedSetTimeout(fn, ms);
};

var probeAttempts = 0;
global.window.Lampa.Reguest = function () {
    this.timeout = function () {};
    this.silent = function (url, success, failure) {
        probeAttempts++;
        if (probeAttempts === 1) {
            failure({ status: 503 });
            return;
        }
        success({
            format: { format_name: 'matroska,webm' },
            streams: [{ codec_type: 'video', codec_name: 'h264', width: 1280, height: 720, r_frame_rate: '25/1' }]
        });
    };
};

var retrySession = { data: { torrent_hash: 'retry', id: 4 }, destroying: false, mediaMeta: null, debug: null, ui: null };
internals.probeTorrentMetadata(retrySession);
check('/ffp: перша спроба error', retrySession.probeState === 'error' && retrySession.probeAttempts === 1 &&
    probeAttempts === 1, JSON.stringify({ state: retrySession.probeState, attempts: retrySession.probeAttempts }));
check('/ffp: retry заплановано', retryCallbacks.length === 1);

if (retryCallbacks[0]) retryCallbacks[0]();
check('/ffp: retry success', retrySession.probeState === 'success' && retrySession.mediaMeta &&
    retrySession.mediaMeta.codec === 'H.264' && probeAttempts === 2,
    JSON.stringify({ state: retrySession.probeState, attempts: probeAttempts }));

global.setTimeout = savedSetTimeout;
global.window.Lampa.Torserver = savedTorserver;
global.window.Lampa.Reguest = savedReguest;
check('formatBytesPerSecond: КБ/с', internals.formatBytesPerSecond(500 * 1024) === '500 КБ/с');
check('formatBytesPerSecond: МБ/с з комою', internals.formatBytesPerSecond(2.5 * 1024 * 1024) === '2,5 МБ/с');
check('formatDownload: фактична швидкість', internals.formatDownload({ mode: 'actual', speed: 1024 }) === '1,0 КБ/с');
check('formatDownload: оцінка за буфером', internals.formatDownload({ mode: 'buffer', speed: null, bufferRate: 1.5 }).indexOf('ОЦІНКА') > -1);
check('formatDownload: немає даних', internals.formatDownload({ mode: 'unavailable' }) === 'Н/Д');

/* Перевірка фактичного лічильника transferSize з підміненим performance/Date. */
var savedPerformance = global.window.performance;
var savedNow = Date.now;
var fakeBytes = 1000;
var fakeNow = 100000;

global.window.performance = {
    getEntriesByName: function () { return [{ transferSize: fakeBytes }]; }
};
Date.now = function () { return fakeNow; };

var transferMeter = internals.createDownloadMeter('http://example.test/media');
transferMeter.sample(0, 0);
fakeBytes = 3000;
fakeNow += 1000;
var transferSample = transferMeter.sample(0, 0);
check('downloadMeter: фактичні transferSize', transferSample.mode === 'actual' && transferSample.speed === 2000,
    JSON.stringify(transferSample));

var savedBufferPerformance = global.window.performance;
global.window.performance = {
    getEntriesByName: function () { return []; }
};
fakeNow += 1000;
var bufferMeter = internals.createDownloadMeter('http://example.test/media2');
bufferMeter.sample(10, 8000000);
fakeNow += 1000;
var bufferSample = bufferMeter.sample(12, 8000000);
check('downloadMeter: оцінка за буфером + бітрейт', bufferSample.mode === 'buffer' &&
    Math.round(bufferSample.bufferRate) === 2 && Math.round(bufferSample.speed) === 2000000,
    JSON.stringify(bufferSample));

Date.now = savedNow;
global.window.performance = savedPerformance;

var formatSession = {
    mediaMeta: ffprobe,
    engine: {
        videoSize: function () { return { width: 1920, height: 1080 }; }
    }
};
check('buildVideoFormat: контейнер/кодек/FPS', internals.buildVideoFormat(formatSession).indexOf('MKV | HEVC | 1920×1080 | 23.976 FPS') > -1,
    internals.buildVideoFormat(formatSession));

var audioLines = internals.collectAudioLines({
    engine: {
        audioTracks: function () {
            return [{ index: 0, title: 'English', codec: 'eac3', channels: 6, sampleRate: 48000, enabled: true }];
        }
    }
});
check('collectAudioLines: номер/назва/кодек/канали/активна', audioLines.indexOf('1. English | E-AC-3 | 5.1 | 48000 Гц [активна]') === 0, audioLines);

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
