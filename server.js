'use strict'

const yargs = require('yargs')
const bunyan = require('bunyan')

const BaseServer = require('./base-server')
const bunyanReporter = require('./reporters/bunyan/process')
const BunyanFormatStream = require('./reporters/human/format')

function bunyanLog (logger, payload) {
  const details = payload.details || {}
  logger[payload.level](details, payload.msg)
}

const AVAILABLE_OPTIONS = [
  'subprotocol', 'supports', 'timeout', 'ping', 'root', 'store', 'server',
  'port', 'host', 'key', 'cert', 'env', 'bunyanLogger', 'reporter'
]

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
  .option('r', {
    alias: 'reporter',
    describe: 'Reporter type',
    choices: ['human', 'bunyan'],
    type: 'string'
  })
  .epilog(
    'Environment variables: ' +
    '\n  LOGUX_HOST, LOGUX_PORT, LOGUX_KEY, LOGUX_CERT, LOGUX_REPORTER'
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
 * @param {string} [options.root=process.cwd()] Application root to load files
 *                                              and show errors.
 * @param {number} [options.timeout=20000] Timeout in milliseconds
 *                                         to disconnect connection.
 * @param {number} [options.ping=10000] Milliseconds since last message to test
 *                                      connection by sending ping.
 * @param {"text"|"bunyan"} [options.reporter="text"] Report process/errors to
 *                                                    CLI in text or bunyan
 *                                                    logger in JSON.
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
 * @param {http.Server} [options.server] HTTP server to connect WebSocket
 *                                       server to it.
 *                                       Same as in ws.WebSocketServer.
 * @param {number} [option.port=1337] Port to bind server. It will create
 *                                    HTTP server manually to connect
 *                                    WebSocket server to it.
 * @param {string} [option.host="127.0.0.1"] IP-address to bind server.
 * @param {string} [option.key] SSL key or path to it. Path could be relative
 *                              from server root. It is required in production
 *                              mode, because WSS is highly recommended.
 * @param {string} [option.cert] SSL certificate or path to it. Path could
 *                               be relative from server root. It is required
 *                               in production mode, because WSS
 *                               is highly recommended.
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
    if (!options) options = { }

    options.reporter = options.reporter || 'human'

    if (!options.bunyanLogger) {
      const human = new BunyanFormatStream({
        env: options.env || process.env.NODE_ENV || 'development',
        options
      })
      options.bunyanLogger = bunyan.createLogger({
        name: 'logux-server',
        stream: options.reporter === 'human' ? human : undefined
      })
    }
    function reporter () {
      bunyanLog(options.bunyanLogger, bunyanReporter.apply(null, arguments))
    }

    let initialized = false
    const onError = e => {
      if (initialized) {
        this.emitter.emit('error', e)
        this.destroy().then(() => {
          process.exit(1)
        })
      } else {
        reporter('error', {
          env: options.env || process.env.NODE_ENV || 'development',
          options
        }, e)
        process.exit(1)
      }
    }
    process.on('uncaughtException', onError)
    process.on('unhandledRejection', onError)

    for (const name in options) {
      if (AVAILABLE_OPTIONS.indexOf(name) === -1) {
        const error = new Error(`Unknown option ${ name }`)
        error.code = 'LOGUX_UNKNOWN_OPTION'
        error.option = name
        throw error
      }
    }

    options.pid = process.pid

    super(options, reporter)
    initialized = true

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
      this.reporter('error', this, e)
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
    options.reporter = options.reporter || argv.r || env.LOGUX_REPORTER
    return options
  }
}

module.exports = Server
