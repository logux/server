var BaseServer = require('./base-server')
var reporter = require('./reporter')

/**
 * End-user API to create Logux server.
 *
 * @param {object} options Server options.
 * @param {string|number} options.nodeId Unique server ID.
 * @param {number[]} options.subprotocol Server current application
 *                                       subprotocol version.
 * @param {number[]} options.supports Which major client’s subprotocol versions
 *                                    are supported by server.
 * @param {string} [options.root=process.cwd()] Application root to load files
 *                                              and show errors.
 * @param {number} [options.timeout=20000] Timeout in milliseconds
 *                                         to disconnect connection.
 * @param {number} [options.ping=10000] Milliseconds since last message to test
 *                                      connection by sending ping.
 * @param {function} [options.timer] Timer to use in log. Will be default
 *                                   timer with server `nodeId`, by default.
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
 *   nodeId: 'server',
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

  var app = this

  function onError (e) {
    app.reporter('runtimeError', app, undefined, e)
    app.destroy().then(function () {
      process.exit(1)
    })
  }
  process.on('uncaughtException', onError)
  process.on('unhandledRejection', onError)

  function onExit () {
    app.destroy().then(function () {
      process.exit(0)
    })
  }
  process.on('SIGINT', onExit)

  this.unbind.push(function () {
    process.removeListener('SIGINT', onExit)
  })
}

Server.prototype = BaseServer.prototype

module.exports = Server
