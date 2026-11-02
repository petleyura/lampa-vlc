# Changelog

Усі помітні зміни проєкту. Формат — стислий, без вигаданих версій і дат.

## v0.5.0 — 2026-11-01

### Додано

- `TizenAvplayEngine` для Samsung Tizen через `webapis.avplay`.
- Автоматичний fallback AVPlay → HTML5 у разі фатальної помилки.
- `ENGINE_CONTRACT` і `EngineFactory` як єдиний інтерфейс рушіїв.
- Пункт плеєра в налаштуваннях Lampa: `player`, `player_torrent`, `player_iptv`.
- Debug Panel із метриками рушія та журналом подій.

### Змінено

- Player Core працює лише через контракт рушія, без прямого доступу до `<video>`/AVPlay.
- Вибір рушія на Tizen: `Platform.is('tizen')` + наявність `webapis.avplay`.

### Обмеження

- Немає UI вибору аудіодоріжок і субтитрів.
- IPTV-пункт є, але перехоплення IPTV не реалізовано.
- HLS/DASH не підтримуються.
- MKV/HEVC/AC-3/DTS залежать від браузера або TV.
- Реальні пристрої Tizen/webOS/Android TV не тестувалися.
