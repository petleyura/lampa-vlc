# Vendor modules (AudioSync)

Ці файли не є частиною основного коду плагіна; вони завантажуються ліниво лише для torrent-джерел із AC-3/E-AC-3.

| Файл | Джерело | Ліцензія |
|---|---|---|
| `mediabunny.min.mjs` | `mediabunny` 1.65.0 | MPL-2.0 |
| `mediabunny-ac3.min.mjs` | `@mediabunny/ac3` 1.65.0 | MPL-2.0; FFmpeg LGPL-2.1+ |

`mediabunny-ac3.min.mjs` мінімально пропатчено: bare import `mediabunny` замінено на `./mediabunny.min.mjs`, щоб модуль працював без import map у Lampa.

Не додавати сюди тестові відео/аудіо та звіти.
