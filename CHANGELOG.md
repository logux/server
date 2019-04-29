# Change Log
This project adheres to [Semantic Versioning](http://semver.org/).

## 0.3.2
* Fix backend proxy version (by Dmitry Salahutdinov).
* Clean up code (by Vladimir Schedrin).

## 0.3.1
* Fix support for `unknownAction` and `unknownChannel` commands from backend.

## 0.3 “SHODAN”
* Rename project from `logux-server` to `@logux/server`.
* Rename `meta.nodeIds` to `meta.nodes`.
* Rename `Server#clients` to `Server#connected`.
* Rename `Server#users` to `Server#userIds`.
* Split subscription to `access`, `init`, and `filter` steps.
* Add `ctx` to callbacks.
* Remove Node.js 6 and 8 support.
* `Server.loadOptions` now overrides default options.
* Change default port from `:1337` to `:31337`.
* Use Logux Core 0.3.
* Add brute force protection.
* Add built-in proxy mode.
* Add HTTP health check API.
* Answer `logux/processed` after action processing.
* Add `ServerClient#clientId` and `meta.clients`.
* Add warning about missed action callbacks.

## 0.2.9
* Use `ws` instead of `uWS`.

## 0.2.8
* Add protection against authentication brute force.

## 0.2.7
* Use `uWS` 9.x with Node.js 10 support.

## 0.2.6
* Use `yargs` 11.x.

## 0.2.5
* Allow to have `:` in user ID.

## 0.2.4
* Use `uWS` 9.x.

## 0.2.3
* Fix `key` option with `{ pem: … }` value on Node.js 9.

## 0.2.2
* Don’t destroy server again on error during destroy.

## 0.2.1
* Don’t show `unknownType` error on server actions without processor.
* Better action and meta view in `human` log.

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
* Show Client ID in log for non-authenticated users.
* Fix docs (by Grigoriy Beziuk, Nick Mitin and Konstantin Krivlenia).
* Always use English for `--help` message.
* Add security note for server output in development mode.

## 0.1.1
* Fix custom HTTP server support.

## 0.1 “Wintermute”
* Initial release.
