# Change Log
This project adheres to [Semantic Versioning](http://semver.org/).

## 0.8.3
* Make node IDs in `TestClient` shorter.

## 0.8.2
* Fix types.

## 0.8.1
* Call `resend` after `access` step in action processing.
* Add special reason for unknown action or channel errors.
* Fix `TestClient` error on unknown action or channel.
* Allow to show log by passing `reporter: "human"` option to `TestServer`.
* Fix calling `resend` on server’s own actions.
* Fix types (by Andrey Berezhnoy).

## 0.8 “Morpheus”
* Rename `init` callback to `load` in `Server#channel()`.
* Add `TestServer` and `TestClient` to test servers.
* Add `filterMeta` helper.
* Fix types.

## 0.7.2
* More flexible types for logger.

## 0.7.1
* Print to the log about denied control requests attempts.
* Fix server options types.
* Return status code 500 on control requests if server has no secret.

## 0.7 “Eliza Cassan”
* Use Logux Core 0.5 and WebSocket Protocol 3.
* Use Back-end Protocol 3.
* Use the same port for WebSocket and control.
* Rename `LOGUX_CONTROL_PASSWORD` to `LOGUX_CONTROL_SECRET`.
* Rename `opts.controlPassword` to `opts.controlSecret`.
* User ID must be always a string.
* Add IP address check for control requests.
* Fix types.

## 0.6.1
* Keep context between steps.
* Fix re-sending actions back to the author.

## 0.6 “Helios”
* Add ES modules support.
* Add TypeScript definitions (by Kirill Neruchev).
* Move API docs from JSDoc to TypeDoc.

## 0.5.3
* Fix Nano Events API.

## 0.5.2
* Fix subscriptions for clients follower.

## 0.5.1
* Fix JSDoc.

## 0.5 “Icarus”
* Add `Context#sendBack()` shortcut.
* Add `finally` callback to `Server#type()`. and `Server#channel()`.
* Add `resend` callback to `Server#type()`.
* Use Backend Protocol 2.
* Deny any re-send meta keys from clients (like `channels`).
* Add singular re-send meta keys support (`channel`, `client`, etc).
* Allow to listen `preadd` and `add` log events in `Server#on()`.
* Use `error` as default reason in `Server#undo()`.
* Set boolean `false` user ID on client IDs like `false:client:uuid`.

## 0.4 “Daedalus”
* Add `.env` support.

## 0.3.4
* Update dependencies.

## 0.3.3
* Improve popular error messages during server launch (by Igor Strebezhev).

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
