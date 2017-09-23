# Change Log
This project adheres to [Semantic Versioning](http://semver.org/).

## 0.2 “Neuromancer”
* Use Logux Protocol 2.
* Use Logux Core 0.2 and Logux Sync 0.2.
* Rename `Client#id` to `Client#userId`.
* Remove `BaseServer#once` method.
* Check action’s node ID to have user ID.
* Use `uws` instead of `ws` (by Anton Savoskin).
* Use Nano ID for node ID.
* Remove deprecated `upgradeReq` from `Client#remoteAddess`.
* Use Chalk 2.0.
* Add `BaseServer#type` method.
* Add `BaseServer#channel` method.
* Add `BaseServer#undo` method.
* Add `BaseServer#sendAction` method.
* Take options from CLI and environment variables (by Pavel Kovalyov).
* Add production non-secure protocol warning (by Hanna Stoliar).
* Add Bunyan log format support (by Anton Artamonov and Mateusz Derks).
* Add `error` event.
* Set `meta.server`, `meta.status` and `meta.subprotocol`.
* Add `debug` message support (by Roman Fursov).
* Add `BaseServer#nodeId` shortcut.
* Add node ID conflict fixing.
* Export `ALLOWED_META`.
* Better start error description (by Grigory Moroz).
* Show Client ID in log for non-authed users.
* Fix docs (by Grigoriy Beziuk, Nick Mitin and Konstantin Krivlenia).
* Always use English for `--help` message.
* Add security note for server output in development mode.

## 0.1.1
* Fix custom HTTP server support.

## 0.1 “Wintermute”
* Initial release.
