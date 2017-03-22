'use strict'

const yargs = require('yargs')
const bunyan = require('bunyan')

const BaseServer = require('./base-server')
const humanReporter = require('./reporters/human/process')
const bunyanReporter = require('./reporters/bunyan/process')

function bunyanLog (logger, payload) {
  const details = payload.details || {}
  logger[payload.level](details, payload.msg)
}

function reportRuntimeError (e, app) {
  if (app.options.reporter === 'bunyan') {
    bunyanLog(app.options.bunyanLogger, bunyanReporter('error', app, e))
  } else {
    process.stderr.write(humanReporter('error', app, e))
  }
}

yargs
  .option('h', {
    alias: 'host',
    describe: 'Host to bind server.',
    type: 'string'
  })
  .option('p', {
    alias: 'port',
    describe: 'Port to bind server',
    type: 'number'
  })
  .option('k', {
    alias: 'key',
    describe: 'Path to SSL key ',
    type: 'string'
  })
  .option('c', {
    alias: 'cert',
    describe: 'Path to SSL certificate',
    type: 'string'
  })
  .epilog(
    'Corresponding ENV variables: LOGUX_HOST, LOGUX_PORT, LOGUX_KEY, LOGUX_CERT'
  )
  .example('$0 --port 31337 --host 127.0.0.1')
  .example('LOGUX_PORT=1337 $0')
  .locale('en')
  .help()

/**
 * End-user API to create Logux server.
 *
 * @param {object} options Server options.
 * @param {string} options.subprotocol Server current application
 *                                     subprotocol version in SemVer format.
 * @param {string} options.supports npm’s version requirements for client
 *                                  subprotocol version.
 * @param {string|number} [options.nodeId] Unique server ID. Be default,
 *                                         `server:` with compacted UUID.
 * @param {string} [options.root=process.cwd()] Application root to load files
 *                                              and show errors.
 * @param {number} [options.timeout=20000] Timeout in milliseconds
 *                                         to disconnect connection.
 * @param {number} [options.ping=10000] Milliseconds since last message to test
 *                                      connection by sending ping.
 * @param {function} [options.timer] Timer to use in log. Will be default
 *                                   timer with server `nodeId`, by default.
 * @param {"cli"|"bunyan"} [options.reporter="cli"] Report process/errors to
 *                                                  CLI in text or bunyan
 *                                                  logger in JSON.
 * @param {Logger} [options.bunyanLogger] Bunyan logger with custom settings
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
 *
 * let env = process.env.NODE_ENV || 'development'
 * let envOptions = {}
 * if (env === 'production') {
 *   envOptions = {
 *     cert: 'cert.pem',
 *     key: 'key.pem'
 *   }
 * }
 *
 * const app = new Server(Object.assign({
 *   subprotocol: '1.0.0',
 *   supports: '1.x || 0.x',
 *   root: __dirname
 * }, envOptions))
 *
 * app.listen()
 *
 * @extends BaseServer
 */
class Server extends BaseServer {
  constructor (options) {
    options.pid = process.pid
    options.reporter = options.reporter || 'text'
    if (options.reporter === 'bunyan' && !options.bunyanLogger) {
      options.bunyanLogger = bunyan.createLogger({ name: 'logux-server' })
    }

    let reporter
    if (options.reporter === 'bunyan') {
      reporter = function () {
        bunyanLog(options.bunyanLogger, bunyanReporter.apply(null, arguments))
      }
    } else {
      reporter = function () {
        process.stderr.write(humanReporter.apply(null, arguments))
      }
    }
    super(options, reporter)

    const onError = e => {
      this.emitter.emit('error', e)
      this.destroy().then(() => {
        process.exit(1)
      })
    }
    process.on('uncaughtException', onError)
    process.on('unhandledRejection', onError)

    const onExit = () => {
      this.destroy().then(() => {
        process.exit(0)
      })
    }
    process.on('SIGINT', onExit)

    this.unbind.push(() => {
      process.removeListener('SIGINT', onExit)
    })
  }

  listen () {
    const origin = BaseServer.prototype.listen
    return origin.apply(this, arguments).catch(e => {
      reportRuntimeError(e, this)
      process.exit(1)
    })
  }

  /**
   * Load options from command-line arguments and/or environment
   *
   * @param {object} process Current process object.
   * @param {object} options Server options.
   * @return {object} Parsed options object.
   *
   * @example
   * const app = new Server(Server.loadOptions(process, {
   *   subprotocol: '1.0.0',
   *   supports: '1.x',
   *   root: __dirname,
   *   port: 31337
   * }))
   */
  static loadOptions (process, options) {
    options = options || { }

    const argv = yargs.parse(process.argv)
    const env = process.env

    options.host = options.host || argv.h || env.LOGUX_HOST
    options.port = parseInt(options.port || argv.p || env.LOGUX_PORT, 10)
    options.cert = options.cert || argv.c || env.LOGUX_CERT
    options.key = options.key || argv.k || env.LOGUX_KEY
    return options
  }
}

module.exports = Server
