/*!
 * Lampa VLC Player — Stage 2 prototype
 * ---------------------------------------------------------------------------
 * Незалежний HTML5-програвач для Lampa у стилі VLC.
 *
 * Перехоплення: Lampa.Player.listener 'create' -> e.abort() -> власний екран.
 * Штатний плеєр Lampa не створюється взагалі.
 *
 * Залежності: лише публічні об'єкти window.Lampa (без змін файлів Lampa).
 * Ціль: ПК / Chrome / Opera; архітектура готова до Tizen/webOS/Android TV.
 *
 * Ліцензія: MIT (код плагіна). VLC-логотип тут — стилізована збірна іконка,
 * а не офіційний брендинг VideoLAN.
 * ---------------------------------------------------------------------------
 */
(function () {
    'use strict';

    /* =====================================================================
     * 0. Захист від повторної ініціалізації
     * ===================================================================== */

    if (window.__lampaVlcPlayer) {
        if (window.console) console.log('[VLC] plugin already initialized');
        return;
    }

    var VERSION = '0.2.0';

    var CONFIG = {
        zIndex: 2147483000,
        uiHideDelay: 3000,      // мс бездіяльності до приховування панелі
        seekStep: 10,           // секунд на ArrowLeft / ArrowRight
        autoRetry: 1,           // автоматичних повторів при мережевій помилці
        debug: /[?&]vlcdebug=1/.test(window.location.search)
    };

    /* =====================================================================
     * 1. Дрібні утиліти
     * ===================================================================== */

    function log() {
        if (!CONFIG.debug || !window.console) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[VLC]');
        console.log.apply(console, args);
    }

    function warn() {
        if (!window.console) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[VLC]');
        console.warn.apply(console, args);
    }

    function safe(fn, fallback) {
        try {
            return fn();
        } catch (e) {
            warn('safe() error:', e && e.message ? e.message : e);
            return fallback;
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function pad2(num) {
        return (num < 10 ? '0' : '') + num;
    }

    function formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '--:--';

        seconds = Math.floor(seconds);

        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = seconds % 60;

        return h > 0 ? (h + ':' + pad2(m) + ':' + pad2(s)) : (pad2(m) + ':' + pad2(s));
    }

    function el(tag, className) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    }

    function svg(markup) {
        return '<svg class="vlc-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + markup + '</svg>';
    }

    /* =====================================================================
     * 2. Іконки (інлайн SVG, без зовнішніх залежностей)
     * ===================================================================== */

    var ICONS = {
        logo: '<svg class="vlc-logo" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
                '<path d="M32 5 L45 47 H19 Z" fill="#FF8800"/>' +
                '<path d="M25.6 21.5 h12.8 l1.5 5.6 H24.1 Z" fill="#ffffff" opacity=".93"/>' +
                '<path d="M22.7 33.6 h18.6 l1.4 5.4 H21.3 Z" fill="#ffffff" opacity=".93"/>' +
                '<ellipse cx="32" cy="50.5" rx="16.5" ry="4.2" fill="#FF8800"/>' +
              '</svg>',

        play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),

        pause: svg('<path d="M7 5h3.6v14H7zm6.4 0H17v14h-3.6z" fill="currentColor"/>'),

        back10: svg('<path d="M11.5 6.2V3L6.4 7.2l5.1 4.2V8.1a5.9 5.9 0 1 1-5.5 8.1H4a8 8 0 1 0 7.5-10z" fill="currentColor"/>' +
                    '<text x="12.2" y="16.3" text-anchor="middle" font-size="6.4" font-family="Arial, sans-serif" fill="currentColor">10</text>'),

        fwd10: svg('<path d="M12.5 6.2V3l5.1 4.2-5.1 4.2V8.1a5.9 5.9 0 1 0 5.5 8.1H20a8 8 0 1 1-7.5-10z" fill="currentColor"/>' +
                   '<text x="11.8" y="16.3" text-anchor="middle" font-size="6.4" font-family="Arial, sans-serif" fill="currentColor">10</text>'),

        gear: svg('<path d="M12 8.6A3.4 3.4 0 1 0 12 15.4 3.4 3.4 0 0 0 12 8.6zm9 4.6l1.7 1.3-1.7 3-2.1-.8a7.7 7.7 0 0 1-1.9 1.1l-.3 2.2h-3.4l-.3-2.2a7.7 7.7 0 0 1-1.9-1.1l-2.1.8-1.7-3L9 13.2a7.6 7.6 0 0 1 0-2.4L7.3 9.5l1.7-3 2.1.8a7.7 7.7 0 0 1 1.9-1.1l.3-2.2h3.4l.3 2.2a7.7 7.7 0 0 1 1.9 1.1l2.1-.8 1.7 3-1.7 1.3a7.6 7.6 0 0 1 0 2.4z" fill="currentColor"/>'),

        close: svg('<path d="M6.2 5l5.8 5.8L17.8 5 19 6.2 13.2 12 19 17.8 17.8 19 12 13.2 6.2 19 5 17.8 10.8 12 5 6.2z" fill="currentColor"/>'),

        replay: svg('<path d="M12 5V1.5L7 6.5l5 5V7a5 5 0 1 1-5 5H4.5A7.5 7.5 0 1 0 12 5z" fill="currentColor"/>'),

        alert: svg('<path d="M12 3l9.5 17h-19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
                   '<path d="M12 9v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
                   '<circle cx="12" cy="17" r="1.1" fill="currentColor"/>')
    };

    /* =====================================================================
     * 3. CSS
     * ===================================================================== */

    var CSS = [
        '.vlc-player{position:fixed;top:0;right:0;bottom:0;left:0;z-index:' + CONFIG.zIndex + ';',
        'background:#000;overflow:hidden;display:block;color:#fff;cursor:none;',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;',
        '-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}',

        '.vlc-player.is-ui{cursor:default}',

        '.vlc-video{position:absolute;top:0;left:0;width:100%;height:100%;',
        'object-fit:contain;background:#000;display:block}',

        /* верхня смуга */
        '.vlc-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:12px;',
        'padding:16px 22px 34px;pointer-events:none;opacity:0;transition:opacity .25s ease;',
        'background:linear-gradient(180deg,rgba(0,0,0,.78) 0%,rgba(0,0,0,.35) 55%,rgba(0,0,0,0) 100%)}',
        '.vlc-player.is-ui .vlc-top{opacity:1}',

        '.vlc-logo{width:26px;height:26px;flex:0 0 auto}',
        '.vlc-brand{display:flex;align-items:center;gap:8px;color:#FF8800;font-size:12px;',
        'font-weight:700;letter-spacing:1.4px;text-transform:uppercase}',
        '.vlc-title{font-size:14px;font-weight:600;color:#f2f2f2;text-shadow:0 1px 3px rgba(0,0,0,.8);',
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%}',

        /* сцена */
        '.vlc-stage{position:absolute;top:0;right:0;bottom:0;left:0;pointer-events:none;',
        'display:flex;align-items:center;justify-content:center}',

        '.vlc-spinner{width:54px;height:54px;border-radius:50%;border:3px solid rgba(255,255,255,.18);',
        'border-top-color:#FF8800;animation:vlc-spin .9s linear infinite;opacity:0;transition:opacity .2s}',
        '.vlc-spinner.is-on{opacity:1}',
        '@keyframes vlc-spin{to{transform:rotate(360deg)}}',

        '.vlc-bigplay{pointer-events:auto;display:none;width:92px;height:92px;border-radius:50%;',
        'border:2px solid rgba(255,136,0,.7);background:rgba(0,0,0,.55);color:#FF8800;',
        'align-items:center;justify-content:center;cursor:pointer;transition:transform .15s,background .15s}',
        '.vlc-bigplay.is-on{display:flex}',
        '.vlc-bigplay:hover{transform:scale(1.06);background:rgba(255,136,0,.16)}',
        '.vlc-bigplay .vlc-ico{width:44px;height:44px}',

        /* нижня панель */
        '.vlc-bottom{position:absolute;left:0;right:0;bottom:0;padding:26px 22px 16px;',
        'background:linear-gradient(0deg,rgba(14,14,14,.94) 0%,rgba(14,14,14,.72) 60%,rgba(14,14,14,0) 100%);',
        'opacity:0;transform:translateY(14px);transition:opacity .25s ease,transform .25s ease;pointer-events:none}',
        '.vlc-player.is-ui .vlc-bottom{opacity:1;transform:none;pointer-events:auto}',

        /* прогрес */
        '.vlc-progress{position:relative;height:20px;display:flex;align-items:center;cursor:pointer;margin-bottom:6px}',
        '.vlc-track{position:relative;width:100%;height:5px;border-radius:3px;background:rgba(255,255,255,.22);overflow:hidden}',
        '.vlc-buffer{position:absolute;top:0;left:0;bottom:0;width:0;background:rgba(255,255,255,.3)}',
        '.vlc-played{position:absolute;top:0;left:0;bottom:0;width:0;background:#FF8800}',
        '.vlc-thumb{position:absolute;top:50%;left:0;width:13px;height:13px;margin-left:-6.5px;border-radius:50%;',
        'background:#FF8800;box-shadow:0 0 0 3px rgba(255,136,0,.22);transform:translateY(-50%) scale(.85);',
        'transition:transform .12s ease}',
        '.vlc-progress:hover .vlc-thumb,.vlc-progress.is-drag .vlc-thumb{transform:translateY(-50%) scale(1.2)}',

        /* кнопки */
        '.vlc-bar{display:flex;align-items:center;gap:14px}',
        '.vlc-group{display:flex;align-items:center;gap:6px}',
        '.vlc-spacer{flex:1 1 auto}',

        '.vlc-btn{pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;gap:4px;',
        'min-width:40px;height:40px;padding:0 8px;border:0;border-radius:8px;background:transparent;',
        'color:#e8e8e8;cursor:pointer;transition:background .15s,color .15s,transform .1s}',
        '.vlc-btn:hover{background:rgba(255,255,255,.1);color:#fff}',
        '.vlc-btn:active{transform:scale(.94)}',
        '.vlc-btn .vlc-ico{width:22px;height:22px}',
        '.vlc-btn--primary{color:#FF8800}',
        '.vlc-btn--primary:hover{color:#FFA733;background:rgba(255,136,0,.14)}',
        '.vlc-btn--close:hover{color:#ff5252;background:rgba(255,82,82,.12)}',

        '.vlc-time{display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums;',
        'font-size:13px;color:#cfcfcf;letter-spacing:.3px;white-space:nowrap}',
        '.vlc-time .vlc-now{color:#FF8800;font-weight:600}',
        '.vlc-time .vlc-sep{opacity:.45}',

        '.vlc-live{display:none;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#FF8800}',
        '.vlc-live.is-on{display:flex}',
        '.vlc-live i{width:7px;height:7px;border-radius:50%;background:#FF8800;animation:vlc-blink 1.4s infinite}',
        '@keyframes vlc-blink{0%,100%{opacity:1}50%{opacity:.25}}',

        /* налаштування */
        '.vlc-settings{position:absolute;right:20px;bottom:86px;width:290px;padding:14px 16px;',
        'border-radius:12px;background:rgba(22,22,22,.97);border:1px solid rgba(255,255,255,.09);',
        'box-shadow:0 18px 40px rgba(0,0,0,.55);display:none;pointer-events:auto}',
        '.vlc-settings.is-on{display:block}',
        '.vlc-settings__title{font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#FF8800;margin-bottom:10px}',
        '.vlc-row{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;color:#bdbdbd;padding:4px 0}',
        '.vlc-row b{color:#f0f0f0;font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:62%}',
        '.vlc-rates{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}',
        '.vlc-rate{pointer-events:auto;padding:5px 9px;border-radius:6px;border:1px solid rgba(255,255,255,.14);',
        'background:transparent;color:#ddd;font-size:12px;cursor:pointer}',
        '.vlc-rate.is-active{border-color:#FF8800;color:#FF8800;background:rgba(255,136,0,.12)}',

        /* помилка */
        '.vlc-error{display:none;pointer-events:auto;max-width:520px;margin:0 24px;padding:26px 28px;',
        'border-radius:14px;background:rgba(20,20,20,.96);border:1px solid rgba(255,136,0,.35);',
        'box-shadow:0 24px 60px rgba(0,0,0,.6);text-align:center}',
        '.vlc-error.is-on{display:block}',
        '.vlc-error__icon{color:#FF8800;margin-bottom:8px}',
        '.vlc-error__icon .vlc-ico{width:38px;height:38px}',
        '.vlc-error__title{font-size:16px;font-weight:700;margin-bottom:8px}',
        '.vlc-error__text{font-size:13px;line-height:1.5;color:#b9b9b9;margin-bottom:18px;word-break:break-word}',
        '.vlc-error__actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}',
        '.vlc-action{pointer-events:auto;padding:9px 18px;border-radius:8px;border:1px solid rgba(255,255,255,.16);',
        'background:transparent;color:#eaeaea;font-size:13px;cursor:pointer}',
        '.vlc-action:hover{background:rgba(255,255,255,.08)}',
        '.vlc-action--primary{background:#FF8800;border-color:#FF8800;color:#141414;font-weight:700}',
        '.vlc-action--primary:hover{background:#FFA733}',

        /* дрібні екрани */
        '@media (max-width:720px){',
        '.vlc-title{display:none}',
        '.vlc-bottom{padding:20px 12px 10px}',
        '.vlc-bar{gap:8px}',
        '.vlc-btn{min-width:34px;height:34px;padding:0 4px}',
        '.vlc-btn .vlc-ico{width:19px;height:19px}',
        '.vlc-settings{right:10px;left:10px;width:auto;bottom:74px}',
        '.vlc-error{margin:0 12px;padding:18px}',
        '}',

        'body.vlc-open{overflow:hidden !important}'
    ].join('');

    function injectStyles() {
        if (document.getElementById('vlc-player-styles')) return;

        var style = document.createElement('style');
        style.id = 'vlc-player-styles';
        style.type = 'text/css';
        style.appendChild(document.createTextNode(CSS));
        (document.head || document.documentElement).appendChild(style);
    }

    /* =====================================================================
     * 4. Модуль Lampa (єдина точка залежності від застосунку)
     * ===================================================================== */

    var LampaApi = {
        available: function () {
            return !!(window.Lampa && window.Lampa.Player && window.Lampa.Player.listener);
        },

        resolvePrevController: function () {
            return safe(function () {
                var enabled = window.Lampa.Controller.enabled();
                return (enabled && enabled.name) || 'content';
            }, 'content');
        },

        toggleController: function (name) {
            safe(function () {
                window.Lampa.Controller.toggle(name || 'content');
            });
        },

        registerController: function (name, handlers) {
            safe(function () {
                window.Lampa.Controller.add(name, handlers);
            });
        },

        toggleToController: function (name) {
            safe(function () {
                window.Lampa.Controller.toggle(name);
            });
        },

        toPlayUrl: function (url) {
            return safe(function () {
                if (window.Lampa.Torserver && typeof window.Lampa.Torserver.toPlayUrl === 'function') {
                    return window.Lampa.Torserver.toPlayUrl(url);
                }
                return url;
            }, url);
        },

        updateTimeline: function (view) {
            safe(function () {
                if (view && window.Lampa.Timeline && typeof window.Lampa.Timeline.update === 'function') {
                    window.Lampa.Timeline.update(view);
                }
            });
        },

        setBackgroundTheme: function (theme) {
            safe(function () {
                if (window.Lampa.Background && typeof window.Lampa.Background.theme === 'function') {
                    window.Lampa.Background.theme(theme);
                }
            });
        },

        isEnabled: function () {
            return safe(function () {
                return window.Lampa.Storage.get('vlc_player_enabled', 'true') !== 'false';
            }, true);
        }
    };

    /* =====================================================================
     * 5. Engine: HTML5 Video
     * ---------------------------------------------------------------------
     * Контракт (майбутні AVPlay/webOS реалізують той самий набір):
     *   mount(container), load(url), play(), pause(), toggle(), seek(t),
     *   seekBy(d), setRate(r), currentTime(), duration(), paused(),
     *   buffered(), videoSize(), destroy()
     * UI не знає, який саме рушій усередині.
     * ===================================================================== */

    function createHtml5Engine(hooks) {
        var video = el('video', 'vlc-video');

        video.setAttribute('playsinline', 'playsinline');
        video.setAttribute('webkit-playsinline', 'webkit-playsinline');
        video.setAttribute('preload', 'metadata');
        video.controls = false;
        video.autoplay = false;

        var destroyed = false;
        var retries = 0;
        var lastTime = 0;
        var retryTimer = null;

        function on(name, fn) {
            video.addEventListener(name, fn, false);
            return function () {
                video.removeEventListener(name, fn, false);
            };
        }

        var disposers = [];

        function bind() {
            disposers.push(on('loadedmetadata', function () { hooks.onMeta(); }));
            disposers.push(on('durationchange', function () { hooks.onMeta(); }));
            disposers.push(on('timeupdate', function () {
                if (!destroyed) lastTime = video.currentTime || 0;
                hooks.onTime();
            }));
            disposers.push(on('progress', function () { hooks.onProgress(); }));
            disposers.push(on('playing', function () { hooks.onPlaying(); }));
            disposers.push(on('play', function () { hooks.onPlayState(); }));
            disposers.push(on('pause', function () { hooks.onPlayState(); }));
            disposers.push(on('waiting', function () { hooks.onWaiting(true); }));
            disposers.push(on('stalled', function () { hooks.onWaiting(true); }));
            disposers.push(on('canplay', function () { hooks.onWaiting(false); }));
            disposers.push(on('seeking', function () { hooks.onWaiting(true); }));
            disposers.push(on('seeked', function () { hooks.onWaiting(false); }));
            disposers.push(on('ended', function () { hooks.onEnded(); }));
            disposers.push(on('ratechange', function () { hooks.onRate(video.playbackRate); }));
            disposers.push(on('error', function () {
                if (destroyed) return;

                var code = video.error ? video.error.code : 0;

                if (code === 2 && retries < CONFIG.autoRetry) {
                    retries++;
                    hooks.onWaiting(true);
                    retryTimer = setTimeout(function () {
                        if (destroyed) return;
                        var resume = lastTime;
                        video.src = video.getAttribute('data-src') || video.src;
                        video.load();
                        if (resume > 0) {
                            try { video.currentTime = resume; } catch (e) { /* ignore */ }
                        }
                        video.play().catch(function () {});
                    }, 1500);
                    return;
                }

                hooks.onError(code);
            }));
        }

        bind();

        var api = {
            el: video,

            mount: function (container) {
                container.appendChild(video);
            },

            load: function (url) {
                lastTime = 0;
                video.setAttribute('data-src', url);
                video.src = url;
                video.load();

                var promise = null;
                try {
                    promise = video.play();
                } catch (e) {
                    promise = null;
                }

                if (promise && typeof promise.catch === 'function') {
                    promise.catch(function (err) {
                        // Найчастіше — autoplay policy: показуємо велику кнопку Play.
                        warn('play() rejected:', err && err.name);
                        hooks.onAutoplayBlocked();
                    });
                }
            },

            play: function () {
                var p = null;
                try { p = video.play(); } catch (e) { p = null; }
                if (p && typeof p.catch === 'function') {
                    p.catch(function () { hooks.onAutoplayBlocked(); });
                }
            },

            pause: function () {
                try { video.pause(); } catch (e) { /* ignore */ }
            },

            toggle: function () {
                if (video.paused) api.play();
                else api.pause();
            },

            seek: function (time) {
                if (!isFinite(time)) return;
                var duration = video.duration;
                var target = isFinite(duration) ? clamp(time, 0, duration) : Math.max(0, time);
                try { video.currentTime = target; } catch (e) { warn('seek failed:', e.message); }
            },

            seekBy: function (delta) {
                api.seek((video.currentTime || 0) + delta);
            },

            setRate: function (rate) {
                try { video.playbackRate = rate; } catch (e) { /* ignore */ }
            },

            currentTime: function () { return video.currentTime || 0; },
            duration: function () { return video.duration; },
            paused: function () { return video.paused; },
            rate: function () { return video.playbackRate; },

            buffered: function () {
                try {
                    var ranges = video.buffered;
                    if (!ranges || !ranges.length) return 0;
                    var current = video.currentTime || 0;
                    for (var i = 0; i < ranges.length; i++) {
                        if (ranges.start(i) <= current && current <= ranges.end(i)) return ranges.end(i);
                    }
                    return ranges.end(ranges.length - 1);
                } catch (e) {
                    return 0;
                }
            },

            videoSize: function () {
                return { width: video.videoWidth || 0, height: video.videoHeight || 0 };
            },

            destroy: function () {
                destroyed = true;
                clearTimeout(retryTimer);

                disposers.forEach(function (off) {
                    try { off(); } catch (e) { /* ignore */ }
                });
                disposers = [];

                try { video.pause(); } catch (e) { /* ignore */ }

                // Вимога Етапу 2: очистити src і викликати load()
                video.removeAttribute('src');
                video.removeAttribute('data-src');
                try { video.load(); } catch (e) { /* ignore */ }

                if (video.parentNode) video.parentNode.removeChild(video);

                api.el = null;
            }
        };

        return api;
    }

    /* =====================================================================
     * 6. UI: повноекранний контейнер у стилі VLC
     * ===================================================================== */

    function createUI(session) {
        var root = el('div', 'vlc-player');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'VLC Player');

        root.innerHTML = [
            '<div class="vlc-top">',
                '<div class="vlc-brand">' + ICONS.logo + '<span>VLC Player</span></div>',
                '<div class="vlc-title"></div>',
            '</div>',

            '<div class="vlc-stage">',
                '<div class="vlc-spinner"></div>',
                '<button type="button" class="vlc-bigplay" aria-label="Відтворити">' + ICONS.play + '</button>',
                '<div class="vlc-error">',
                    '<div class="vlc-error__icon">' + ICONS.alert + '</div>',
                    '<div class="vlc-error__title"></div>',
                    '<div class="vlc-error__text"></div>',
                    '<div class="vlc-error__actions">',
                        '<button type="button" class="vlc-action vlc-action--primary" data-act="retry">Спробувати ще раз</button>',
                        '<button type="button" class="vlc-action" data-act="close">Закрити</button>',
                    '</div>',
                '</div>',
            '</div>',

            '<div class="vlc-bottom">',
                '<div class="vlc-progress" role="slider" aria-label="Позиція" tabindex="0">',
                    '<div class="vlc-track">',
                        '<div class="vlc-buffer"></div>',
                        '<div class="vlc-played"></div>',
                    '</div>',
                    '<div class="vlc-thumb"></div>',
                '</div>',
                '<div class="vlc-bar">',
                    '<div class="vlc-group">',
                        '<button type="button" class="vlc-btn vlc-btn--primary" data-act="toggle" aria-label="Пауза">' + ICONS.pause + '</button>',
                        '<button type="button" class="vlc-btn" data-act="back" aria-label="Назад на 10 секунд">' + ICONS.back10 + '</button>',
                        '<button type="button" class="vlc-btn" data-act="fwd" aria-label="Вперед на 10 секунд">' + ICONS.fwd10 + '</button>',
                    '</div>',
                    '<div class="vlc-time">',
                        '<span class="vlc-now">00:00</span>',
                        '<span class="vlc-sep">/</span>',
                        '<span class="vlc-dur">00:00</span>',
                    '</div>',
                    '<div class="vlc-live"><i></i><span>LIVE</span></div>',
                    '<div class="vlc-spacer"></div>',
                    '<div class="vlc-group">',
                        '<button type="button" class="vlc-btn" data-act="settings" aria-label="Налаштування">' + ICONS.gear + '</button>',
                        '<button type="button" class="vlc-btn vlc-btn--close" data-act="close" aria-label="Закрити">' + ICONS.close + '</button>',
                    '</div>',
                '</div>',
            '</div>',

            '<div class="vlc-settings">',
                '<div class="vlc-settings__title">Відтворення</div>',
                '<div class="vlc-row"><span>Рушій</span><b data-info="engine">HTML5 Video</b></div>',
                '<div class="vlc-row"><span>Роздільність</span><b data-info="size">—</b></div>',
                '<div class="vlc-row"><span>Буфер</span><b data-info="buffer">0 с</b></div>',
                '<div class="vlc-row"><span>Джерело</span><b data-info="source">—</b></div>',
                '<div class="vlc-rates">',
                    '<button type="button" class="vlc-rate" data-rate="0.5">0.5×</button>',
                    '<button type="button" class="vlc-rate" data-rate="0.75">0.75×</button>',
                    '<button type="button" class="vlc-rate is-active" data-rate="1">1×</button>',
                    '<button type="button" class="vlc-rate" data-rate="1.25">1.25×</button>',
                    '<button type="button" class="vlc-rate" data-rate="1.5">1.5×</button>',
                    '<button type="button" class="vlc-rate" data-rate="2">2×</button>',
                '</div>',
            '</div>'
        ].join('');

        var refs = {
            top: root.querySelector('.vlc-top'),
            title: root.querySelector('.vlc-title'),
            spinner: root.querySelector('.vlc-spinner'),
            bigplay: root.querySelector('.vlc-bigplay'),
            error: root.querySelector('.vlc-error'),
            errorTitle: root.querySelector('.vlc-error__title'),
            errorText: root.querySelector('.vlc-error__text'),
            bottom: root.querySelector('.vlc-bottom'),
            progress: root.querySelector('.vlc-progress'),
            buffer: root.querySelector('.vlc-buffer'),
            played: root.querySelector('.vlc-played'),
            thumb: root.querySelector('.vlc-thumb'),
            now: root.querySelector('.vlc-now'),
            dur: root.querySelector('.vlc-dur'),
            live: root.querySelector('.vlc-live'),
            toggle: root.querySelector('[data-act="toggle"]'),
            settings: root.querySelector('.vlc-settings'),
            infoEngine: root.querySelector('[data-info="engine"]'),
            infoSize: root.querySelector('[data-info="size"]'),
            infoBuffer: root.querySelector('[data-info="buffer"]'),
            infoSource: root.querySelector('[data-info="source"]')
        };

        var hideTimer = null;
        var uiVisible = false;
        var dragging = false;

        function isSettingsOpen() {
            return refs.settings.classList.contains('is-on');
        }

        function clearHideTimer() {
            clearTimeout(hideTimer);
            hideTimer = null;
        }

        function scheduleHide() {
            clearHideTimer();
            if (session.ended || session.errorCode || isSettingsOpen()) return;
            if (session.engine && session.engine.paused()) return;

            hideTimer = setTimeout(function () {
                if (session.ended || session.errorCode || isSettingsOpen()) return;
                if (session.engine && session.engine.paused()) return;
                hide();
            }, CONFIG.uiHideDelay);
        }

        function show() {
            if (!uiVisible) {
                uiVisible = true;
                root.classList.add('is-ui');
            }
            scheduleHide();
        }

        function hide() {
            if (isSettingsOpen()) return;
            uiVisible = false;
            root.classList.remove('is-ui');
            clearHideTimer();
        }

        function setTitle(text) {
            refs.title.textContent = text || '';
        }

        function setTime(current, duration) {
            refs.now.textContent = formatTime(current);
            refs.dur.textContent = formatTime(duration);
        }

        function setLive(isLive) {
            refs.live.classList.toggle('is-on', !!isLive);
            refs.dur.style.display = isLive ? 'none' : '';
            refs.progress.style.visibility = isLive ? 'hidden' : '';
        }

        function setProgress(current, duration, buffered) {
            var percent = 0;
            if (isFinite(duration) && duration > 0) percent = clamp(current / duration, 0, 1);

            if (!dragging) {
                refs.played.style.width = (percent * 100) + '%';
                refs.thumb.style.left = (percent * 100) + '%';
            }

            if (isFinite(duration) && duration > 0 && isFinite(buffered) && buffered > 0) {
                refs.buffer.style.width = (clamp(buffered / duration, 0, 1) * 100) + '%';
            } else {
                refs.buffer.style.width = '0%';
            }
        }

        function setPlayState(paused) {
            refs.toggle.innerHTML = paused ? ICONS.play : ICONS.pause;
            refs.toggle.setAttribute('aria-label', paused ? 'Відтворити' : 'Пауза');
            root.classList.toggle('is-paused', !!paused);
        }

        function setLoading(on) {
            refs.spinner.classList.toggle('is-on', !!on);
        }

        function setBigPlay(on) {
            refs.bigplay.classList.toggle('is-on', !!on);
        }

        function setSize(size) {
            refs.infoSize.textContent = size && size.width
                ? (size.width + '×' + size.height)
                : '—';
        }

        function setBuffer(seconds) {
            refs.infoBuffer.textContent = (Math.max(0, seconds || 0)).toFixed(0) + ' с';
        }

        function setSource(url) {
            var text = url || '—';
            try {
                var parsed = new URL(url, window.location.href);
                text = parsed.host + parsed.pathname;
            } catch (e) { /* залишаємо як є */ }
            refs.infoSource.textContent = text;
            refs.infoSource.title = url || '';
        }

        function openSettings() {
            refs.settings.classList.add('is-on');
            show();
            clearHideTimer();
        }

        function closeSettings() {
            refs.settings.classList.remove('is-on');
            scheduleHide();
        }

        function toggleSettings() {
            if (isSettingsOpen()) closeSettings();
            else openSettings();
        }

        function setActiveRate(rate) {
            var buttons = refs.settings.querySelectorAll('.vlc-rate');
            for (var i = 0; i < buttons.length; i++) {
                buttons[i].classList.toggle('is-active', parseFloat(buttons[i].getAttribute('data-rate')) === rate);
            }
        }

        function showError(title, text) {
            refs.errorTitle.textContent = title;
            refs.errorText.textContent = text;
            refs.error.classList.add('is-on');
            setBigPlay(false);
            setLoading(false);
            show();
            clearHideTimer();
        }

        function clearError() {
            refs.error.classList.remove('is-on');
            refs.errorTitle.textContent = '';
            refs.errorText.textContent = '';
        }

        // --- прогрес: клік і перетягування ---

        function ratioFromEvent(event) {
            var rect = refs.progress.getBoundingClientRect();
            if (!rect.width) return 0;
            return clamp((event.clientX - rect.left) / rect.width, 0, 1);
        }

        function previewRatio(ratio) {
            refs.played.style.width = (ratio * 100) + '%';
            refs.thumb.style.left = (ratio * 100) + '%';

            var duration = session.engine ? session.engine.duration() : 0;
            if (isFinite(duration) && duration > 0) {
                refs.now.textContent = formatTime(ratio * duration);
            }
        }

        function onPointerDown(event) {
            if (!session.engine) return;
            var duration = session.engine.duration();
            if (!isFinite(duration) || duration <= 0) return;

            dragging = true;
            refs.progress.classList.add('is-drag');
            previewRatio(ratioFromEvent(event));

            if (refs.progress.setPointerCapture && event.pointerId !== undefined) {
                try { refs.progress.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
            }

            event.preventDefault();
        }

        function onPointerMove(event) {
            if (!dragging) return;
            previewRatio(ratioFromEvent(event));
        }

        function onPointerUp(event) {
            if (!dragging) return;

            var ratio = ratioFromEvent(event);
            dragging = false;
            refs.progress.classList.remove('is-drag');

            var duration = session.engine ? session.engine.duration() : 0;
            if (isFinite(duration) && duration > 0) {
                session.engine.seek(ratio * duration);
            }

            scheduleHide();
        }

        refs.progress.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        var disposers = [
            function () { refs.progress.removeEventListener('pointerdown', onPointerDown); },
            function () { window.removeEventListener('pointermove', onPointerMove); },
            function () { window.removeEventListener('pointerup', onPointerUp); }
        ];

        return {
            root: root,
            refs: refs,

            show: show,
            hide: hide,
            scheduleHide: scheduleHide,
            setTitle: setTitle,
            setTime: setTime,
            setProgress: setProgress,
            setPlayState: setPlayState,
            setLoading: setLoading,
            setBigPlay: setBigPlay,
            setLive: setLive,
            setSize: setSize,
            setBuffer: setBuffer,
            setSource: setSource,
            setActiveRate: setActiveRate,
            toggleSettings: toggleSettings,
            closeSettings: closeSettings,
            isSettingsOpen: isSettingsOpen,
            showError: showError,
            clearError: clearError,

            dispose: function () {
                clearHideTimer();
                disposers.forEach(function (fn) {
                    try { fn(); } catch (e) { /* ignore */ }
                });
                disposers = [];
            }
        };
    }

    /* =====================================================================
     * 7. Session: життєвий цикл сесії
     * ===================================================================== */

    var session = null;

    var Session = {
        isOpen: function () {
            return !!session;
        },

        open: function (data, url, prevController) {
            if (session) Session.close('replaced', true);

            injectStyles();

            session = {
                data: data,
                url: url,
                prevController: prevController || 'content',
                engine: null,
                ui: null,
                disposers: [],
                keydownHandler: null,
                keyupHandler: null,
                mousemoveHandler: null,
                resizeHandler: null,
                ended: false,
                errorCode: 0,
                destroying: false
            };

            var s = session;

            s.ui = createUI(s);
            document.body.appendChild(s.ui.root);
            document.body.classList.add('vlc-open');

            s.prevBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';

            LampaApi.setBackgroundTheme('black');

            var hooks = {
                onMeta: function () { onMeta(s); },
                onTime: function () { onTime(s); },
                onProgress: function () { onProgress(s); },
                onPlaying: function () { onPlaying(s); },
                onPlayState: function () { onPlayState(s); },
                onWaiting: function (on) { if (s.ui) s.ui.setLoading(on); },
                onEnded: function () { onEnded(s); },
                onError: function (code) { onError(s, code); },
                onRate: function (rate) { if (s.ui) s.ui.setActiveRate(rate); },
                onAutoplayBlocked: function () { if (s.ui) s.ui.setBigPlay(true); }
            };

            s.engine = createHtml5Engine(hooks);
            s.engine.mount(s.ui.root);

            // Відео має бути ПІД шаром керування: переносимо його на початок root.
            s.ui.root.insertBefore(s.engine.el, s.ui.root.firstChild);

            bindControls(s);
            bindRemote(s);
            bindLampaController(s);

            s.ui.setTitle(getTitle(data));
            s.ui.setSource(url);
            s.ui.setPlayState(true);
            s.ui.show();

            log('open session', url);
            s.engine.load(url);
        },

        close: function (reason, silent) {
            if (!session) return;

            var s = session;
            session = null;

            log('close session:', reason || 'user');

            s.destroying = true;

            // 1. Зберегти прогрес до знищення рушія
            saveProgress(s);

            // 2. Зупинити відтворення + очистити джерело (всередині engine.destroy)
            if (s.engine) {
                safe(function () { s.engine.destroy(); });
                s.engine = null;
            }

            // 3. Зняти глобальні обробники
            unbindRemote(s);

            if (s.ui) {
                safe(function () { s.ui.dispose(); });
                safe(function () { s.ui.root.parentNode && s.ui.root.parentNode.removeChild(s.ui.root); });
                s.ui = null;
            }

            // 4. Відновити стан сторінки
            document.body.classList.remove('vlc-open');
            document.body.style.overflow = s.prevBodyOverflow || '';
            LampaApi.setBackgroundTheme('reset');

            s.data = null;
            s.url = null;

            // 5. Повернути контролер Lampa (картка фільму / список торентів)
            if (!silent) {
                var target = s.prevController || 'content';

                if (target === 'vlc_player') target = 'content';

                // Якщо плеєр відкривали з модального вікна, а його вже закрито —
                // повертаємось у контент, а не в неіснуючий контролер.
                if (target === 'modal' && !document.querySelector('.modal')) target = 'content';

                LampaApi.toggleController(target);

                // Якщо попередній контролер уже не існує — гарантований вихід у контент.
                safe(function () {
                    var now = window.Lampa.Controller.enabled();
                    if (!now || !now.name || now.name === 'vlc_player') {
                        window.Lampa.Controller.toggle('content');
                    }
                });
            }
        },

        current: function () {
            return session;
        }
    };

    /* =====================================================================
     * 8. Обробники подій рушія
     * ===================================================================== */

    function getTitle(data) {
        if (!data) return 'Відео';

        var card = data.card || data.movie || null;
        var title = data.title
            || (card && (card.title || card.name))
            || (data.playlist && data.playlist.length === 1 && data.playlist[0].title)
            || 'Відео';

        return String(title).replace(/<[^>]*>?/gm, '');
    }

    function onMeta(s) {
        if (!s.ui || !s.engine) return;

        var duration = s.engine.duration();
        var live = !isFinite(duration) || duration <= 0;

        s.ui.setLive(live);
        s.ui.setSize(s.engine.videoSize());
        s.ui.setTime(s.engine.currentTime(), duration);
        s.ui.setProgress(s.engine.currentTime(), duration, s.engine.buffered());
    }

    function onTime(s) {
        if (!s.ui || !s.engine) return;

        var duration = s.engine.duration();
        s.ui.setTime(s.engine.currentTime(), duration);
        s.ui.setProgress(s.engine.currentTime(), duration, s.engine.buffered());
    }

    function onProgress(s) {
        if (!s.ui || !s.engine) return;
        s.ui.setBuffer(s.engine.buffered() - s.engine.currentTime());
    }

    function onPlaying(s) {
        if (!s.ui) return;
        s.ui.setLoading(false);
        s.ui.setBigPlay(false);
        s.ui.clearError();
        s.errorCode = 0;
        s.ui.setPlayState(false);
        s.ui.scheduleHide();
    }

    function onPlayState(s) {
        if (!s.ui || !s.engine) return;
        s.ui.setPlayState(s.engine.paused());
        if (!s.engine.paused()) s.ui.scheduleHide();
        else s.ui.show();
    }

    function onEnded(s) {
        s.ended = true;
        if (!s.ui) return;

        s.ui.setPlayState(true);
        s.ui.show();

        var reference = s.engine ? s.engine.el : null;
        if (!reference) return;

        // Кнопка повторного перегляду замість чорного екрана.
        s.ui.refs.bigplay.classList.add('is-on');
        s.ui.refs.bigplay.innerHTML = ICONS.replay;
        s.ui.refs.bigplay.setAttribute('aria-label', 'Дивитися ще раз');

        var replay = function () {
            if (!s.engine) return;
            s.ended = false;
            s.ui.refs.bigplay.classList.remove('is-on');
            s.ui.refs.bigplay.innerHTML = ICONS.play;
            s.engine.seek(0);
            s.engine.play();
        };

        s.ui.refs.bigplay.onclick = replay;
    }

    var ERROR_MESSAGES = {
        1: { title: 'Відтворення перервано', text: 'Завантаження відео було скасовано.' },
        2: { title: 'Помилка мережі', text: 'Не вдалося завантажити відео. Перевірте з’єднання та доступність джерела.' },
        3: { title: 'Помилка декодування', text: 'Формат або кодек не підтримується цим пристроєм чи браузером.' },
        4: { title: 'Формат не підтримується', text: 'Браузер не може відтворити це джерело. Можливі причини: MKV/HEVC/AC-3 або непідтримуваний контейнер.' }
    };

    function onError(s, code) {
        if (!s || s.destroying) return;

        s.errorCode = code || -1;
        s.ui && s.ui.setLoading(false);
        s.ui && s.ui.setBigPlay(false);

        var message = ERROR_MESSAGES[code] || {
            title: 'Помилка відтворення',
            text: 'Не вдалося відтворити відео (код ' + code + ').'
        };

        warn('media error', code);

        if (s.ui) {
            s.ui.showError(message.title, message.text);
        }
    }

    /* =====================================================================
     * 9. Controls: кнопки, перемотування, налаштування
     * ===================================================================== */

    function bindControls(s) {
        var ui = s.ui;
        var root = ui.root;

        function onClick(event) {
            var target = event.target.closest('button[data-act], button[data-rate]');
            if (!target) return;

            event.preventDefault();
            event.stopPropagation();

            var act = target.getAttribute('data-act');
            var rate = target.getAttribute('data-rate');

            if (rate) {
                s.engine.setRate(parseFloat(rate));
                ui.setActiveRate(parseFloat(rate));
                return;
            }

            if (act === 'toggle') s.engine.toggle();
            else if (act === 'back') s.engine.seekBy(-CONFIG.seekStep);
            else if (act === 'fwd') s.engine.seekBy(CONFIG.seekStep);
            else if (act === 'settings') ui.toggleSettings();
            else if (act === 'close') Session.close('button');
            else if (act === 'retry') retry(s);
        }

        root.addEventListener('click', onClick);
        s.disposers.push(function () { root.removeEventListener('click', onClick); });

        // Клік по відео (поза панеллю) — play/pause, як у VLC.
        function onRootClick(event) {
            if (event.target.closest('.vlc-bottom, .vlc-settings, .vlc-error, .vlc-bigplay, .vlc-top')) return;

            // Клік поза відкритими налаштуваннями лише закриває їх.
            if (ui.isSettingsOpen()) {
                ui.closeSettings();
                return;
            }

            s.engine.toggle();
        }

        root.addEventListener('click', onRootClick);
        s.disposers.push(function () { root.removeEventListener('click', onRootClick); });

        // Велика кнопка Play (autoplay / replay)
        ui.refs.bigplay.addEventListener('click', function (event) {
            event.stopPropagation();
            if (s.ended) return; // обробляється в onEnded
            ui.setBigPlay(false);
            s.engine.play();
        });

        // Закриття налаштувань кліком поза ними
        function onDocClick(event) {
            if (!ui.isSettingsOpen()) return;
            if (event.target.closest('.vlc-settings, [data-act="settings"]')) return;
            ui.closeSettings();
        }

        document.addEventListener('click', onDocClick, true);
        s.disposers.push(function () { document.removeEventListener('click', onDocClick, true); });
    }

    function retry(s) {
        if (!s || !s.url || !s.engine) return;

        s.errorCode = 0;
        s.ended = false;
        s.ui.clearError();
        s.ui.setLoading(true);

        var resume = s.engine.currentTime();

        var video = s.engine.el;
        if (!video) return;

        video.setAttribute('data-src', s.url);
        video.src = s.url;
        video.load();

        if (resume > 0) {
            try { video.currentTime = resume; } catch (e) { /* ignore */ }
        }

        s.engine.play();
    }

    /* =====================================================================
     * 10. Remote: клавіатура (ПК) + заготовка під Lampa.Keypad
     * ===================================================================== */

    function bindRemote(s) {
        var state = { lastActivity: 0 };

        s.keydownHandler = function (event) {
            if (!session || session !== s) return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;

            var code = event.keyCode || event.which;

            if (code === 32) {            // Space
                event.preventDefault();
                event.stopPropagation();
                s.engine.toggle();
                s.ui.show();
                return;
            }

            if (code === 37) {            // ArrowLeft
                event.preventDefault();
                event.stopPropagation();
                s.engine.seekBy(-CONFIG.seekStep);
                s.ui.show();
                return;
            }

            if (code === 39) {            // ArrowRight
                event.preventDefault();
                event.stopPropagation();
                s.engine.seekBy(CONFIG.seekStep);
                s.ui.show();
                return;
            }

            if (code === 27) {            // Escape
                event.preventDefault();
                event.stopPropagation();

                if (s.ui.isSettingsOpen()) s.ui.closeSettings();
                else Session.close('escape');

                return;
            }

            if (code === 13) {            // Enter
                event.preventDefault();
                event.stopPropagation();

                var active = document.activeElement;
                if (active && s.ui.root.contains(active) && active.tagName === 'BUTTON') {
                    active.click();
                } else {
                    s.engine.toggle();
                }
                s.ui.show();
                return;
            }
        };

        s.keyupHandler = function (event) {
            if (!session || session !== s) return;
            var code = event.keyCode || event.which;

            // Enter у Lampa обробляється на keyup — глушимо, щоб не було подвійної дії.
            if (code === 13 || code === 32) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        s.mousemoveHandler = function () {
            if (!session || session !== s) return;
            s.ui.show();
        };

        s.resizeHandler = function () {
            if (!session || session !== s || !s.ui) return;
            if (s.engine) s.ui.setSize(s.engine.videoSize());
        };

        window.addEventListener('keydown', s.keydownHandler, true);
        window.addEventListener('keyup', s.keyupHandler, true);
        window.addEventListener('mousemove', s.mousemoveHandler, false);
        window.addEventListener('resize', s.resizeHandler, false);
    }

    function unbindRemote(s) {
        if (!s) return;

        if (s.keydownHandler) window.removeEventListener('keydown', s.keydownHandler, true);
        if (s.keyupHandler) window.removeEventListener('keyup', s.keyupHandler, true);
        if (s.mousemoveHandler) window.removeEventListener('mousemove', s.mousemoveHandler, false);
        if (s.resizeHandler) window.removeEventListener('resize', s.resizeHandler, false);

        s.keydownHandler = null;
        s.keyupHandler = null;
        s.mousemoveHandler = null;
        s.resizeHandler = null;
    }

    /* =====================================================================
     * 11. Інтеграція з контролером Lampa
     * ---------------------------------------------------------------------
     * Lampa може викликати Controller.back() (напр. подвійний/потрійний Back
     * або Activity) — тоді закриваємо свій плеєр, а не залишаємо «сироту».
     * ===================================================================== */

    function bindLampaController(s) {
        var name = 'vlc_player';

        LampaApi.registerController(name, {
            invisible: true,
            toggle: function () { s.ui && s.ui.show(); },
            back: function () { Session.close('lampa-back'); },
            enter: function () { if (s.engine) s.engine.toggle(); },
            up: function () { s.ui && s.ui.show(); },
            down: function () { s.ui && s.ui.show(); },
            left: function () { s.ui && s.ui.show(); },
            right: function () { s.ui && s.ui.show(); },
            gone: function () {
                // Lampa пішла з нашого контролера не через наш close() — прибираємо оверлей.
                if (session === s) Session.close('lampa-gone', true);
            }
        });

        LampaApi.toggleToController(name);
    }

    /* =====================================================================
     * 12. Прогрес / таймлайн
     * ===================================================================== */

    function saveProgress(s) {
        if (!s.engine) return;

        var time = s.engine.currentTime();
        var duration = s.engine.duration();

        if (!isFinite(time) || time < 3) return;

        var view = s.data && s.data.timeline;

        if (view && typeof view === 'object') {
            view.time = time;
            if (isFinite(duration) && duration > 0) {
                view.duration = duration;
                view.percent = clamp(Math.round(time / duration * 100), 0, 100);
            }
            LampaApi.updateTimeline(view);
        }

        if (s.data && typeof s.data.viewed === 'function') {
            safe(function () { s.data.viewed(Math.round(time)); });
        }
    }

    /* =====================================================================
     * 13. Interceptor
     * ===================================================================== */

    function resolveUrl(data) {
        var url = data && data.url;

        if (Array.isArray(url)) url = url[0];
        if (typeof url !== 'string' || !url) return '';

        return LampaApi.toPlayUrl(url);
    }

    function onPlayerCreate(event) {
        if (!event || !event.data) return;

        if (!LampaApi.isEnabled()) {
            log('disabled by setting vlc_player_enabled=false');
            return;
        }

        var data = event.data;
        var url = resolveUrl(data);

        if (!url) {
            warn('create without url — передаємо керування Lampa');
            return;
        }

        if (typeof event.abort !== 'function') {
            // Фіксуємо проблему, не вигадуємо обхід: без abort() перехоплення неможливе.
            console.error('[VLC] player "create" event has no abort() — interception impossible');
            return;
        }

        var prevController = LampaApi.resolvePrevController();

        // Блокуємо зовнішні гілки (Android intent, webOS app, apple-схеми).
        safe(function () { data.launch_player = 'lampa'; });

        event.abort();

        Session.open(data, url, prevController);
    }

    function bindInterceptor() {
        var listener = window.Lampa && window.Lampa.Player && window.Lampa.Player.listener;

        if (!listener || typeof listener.follow !== 'function') {
            warn('Lampa.Player.listener недоступний — перехоплення не встановлено');
            return false;
        }

        listener.follow('create', onPlayerCreate);
        log('interceptor bound');
        return true;
    }

    /* =====================================================================
     * 14. Boot
     * ===================================================================== */

    var started = false;

    function boot() {
        if (started) return;
        if (!LampaApi.available()) {
            warn('Lampa API недоступний — ініціалізацію відкладено');
            return;
        }

        started = true;

        injectStyles();
        bindInterceptor();

        log('ready, version', VERSION);
    }

    function whenLampaReady(callback) {
        if (window.appready) {
            callback();
            return;
        }

        if (window.Lampa && window.Lampa.Listener && typeof window.Lampa.Listener.follow === 'function') {
            window.Lampa.Listener.follow('app', function (event) {
                if (event && event.type === 'ready') callback();
            });
        } else {
            // Lampa ще не завантажилась як об'єкт — короткий polling.
            var tries = 0;
            var timer = setInterval(function () {
                tries++;
                if (window.Lampa && window.Lampa.Player) {
                    clearInterval(timer);
                    callback();
                } else if (tries > 100) {
                    clearInterval(timer);
                    warn('timeout waiting for Lampa');
                }
            }, 200);
        }
    }

    /* =====================================================================
     * 15. Публічний міні-API (для діагностики та тестів)
     * ===================================================================== */

    window.__lampaVlcPlayer = {
        version: VERSION,
        config: CONFIG,

        isReady: function () { return started; },
        isOpen: function () { return Session.isOpen(); },
        session: function () { return Session.current(); },

        open: function (data) {
            var url = resolveUrl(data);
            if (!url) return false;
            Session.open(data, url, LampaApi.resolvePrevController());
            return true;
        },

        close: function (reason) { Session.close(reason || 'api'); },

        setEnabled: function (enabled) {
            safe(function () { window.Lampa.Storage.set('vlc_player_enabled', enabled ? 'true' : 'false'); });
        },

        _internals: {
            Session: Session,
            resolveUrl: resolveUrl
        }
    };

    whenLampaReady(boot);
})();
