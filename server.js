var BaseServer = require('./base-server')
var reporter = require('./reporter')

/**
 * End-user API to create Logux server.
 *
 * @param {object} options Server options.
 * @param {string|number} options.uniqName Unique server ID.
 * @param {number[]} options.subprotocol Server current application
 *                                       subprotocol version.
 * @param {number[]} options.supports Which major client’s subprotocol versions
 *                                    are supported by server.
 * @param {function} [options.timer] Timer to use in log. Will be default
 *                                   timer with server `uniqName`, by default.
 * @param {Store} [options.store] Store to save log. Will be `MemoryStore`,
 *                                by default.
 * @param {"production"|"development"} [options.env] Development or production
 *                                                   server mode. By default,
 *                                                   it will be taken from
 *                                                   `NODE_ENV` environment
 *                                                   variable. On empty
 *                                                   `NODE_ENV` it will
 *                                                   be `"development"`.
 *
 * @example
 * import { Server } from 'logux-server'
 * const app = new Server({
 *   uniqName: 'server',
 *   subprotocol: [1, 0],
 *   supports: [1]
 * })
 * app.listen()
 *
 * @class
 * @extends BaseServer
 */
function Server (options) {
  BaseServer.call(this, options, function () {
    process.stderr.write(reporter.apply(reporter, arguments))
  })
}

Server.prototype = BaseServer.prototype

module.exports = Server
