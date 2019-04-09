let yargs = require('yargs')

let createReporter = require('./create-reporter')
let BaseServer = require('./base-server')

const AVAILABLE_OPTIONS = [
  'subprotocol', 'supports', 'timeout', 'ping', 'root', 'store', 'server',
  'port', 'host', 'key', 'cert', 'env', 'bunyan', 'reporter', 'backend',
  'controlHost', 'controlPort', 'controlPassword', 'redis'
]

const ENVS = {
  host: 'LOGUX_HOST',
  port: 'LOGUX_PORT',
  key: 'LOGUX_KEY',
  cert: 'LOGUX_CERT',
  reporter: 'LOGUX_REPORTER',
  redis: 'LOGUX_REDIS',
  controlHost: 'LOGUX_CONTROL_HOST',
  controlPort: 'LOGUX_CONTROL_PORT',
  controlPassword: 'LOGUX_CONTROL_PASSWORD',
  backend: 'LOGUX_BACKEND'
}

function envHelp () {
  let lines = ['  ']
  for (let key in ENVS) {
    if (lines[lines.length - 1].length + ENVS[key].length + 2 > 80) {
      lines.push('  ')
    }
    if (lines[lines.length - 1].length > 2) {
      lines[lines.length - 1] += ', '
    }
    lines[lines.length - 1] += ENVS[key]
  }
  return lines.join('\n')
}

yargs
  .option('host', {
    alias: 'h',
    describe: 'Host to bind server.',
    type: 'string'
  })
  .option('port', {
    alias: 'p',
    describe: 'Port to bind server',
    type: 'number'
  })
  .option('key', {
    describe: 'Path to SSL key ',
    type: 'string'
  })
  .option('cert', {
    describe: 'Path to SSL certificate',
    type: 'string'
  })
  .option('reporter', {
    alias: 'r',
    describe: 'Reporter type',
    choices: ['human', 'json'],
    type: 'string'
  })
  .option('backend', {
    describe: 'Backend to process actions and authentication',
    type: 'string'
  })
  .option('control-host', {
    describe: 'Host to bind HTTP server to control Logux server',
    type: 'string'
  })
  .option('control-port', {
    describe: 'Port to bind HTTP server to control Logux server',
    type: 'number'
  })
  .option('control-password', {
    describe: 'Password to control Logux server',
    type: 'string'
  })
  .option('redis', {
    describe: 'URL to Redis for Logux scaling',
    type: 'string'
  })
  .epilog(`Environment variables: \n${ envHelp() }`)
  .example('$0 --port 31337 --host 127.0.0.1')
  .example('LOGUX_PORT=1337 $0')
  .locale('en')
  .help()
  .version(false)

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
 * @param {string} [options.backend] URL to PHP, Ruby on Rails,
 *                                   or other backend to process actions
 *                                   and authentication.
 * @param {string} [option.redis] URL to Redis for Logux scaling.
 * @param {number} [options.controlHost="127.0.0.1"] Host to bind HTTP server
 *                                                   to control Logux server.
 * @param {number} [options.controlPort=31338] Port to control the server.
 * @param {string} [options.controlPassword] Password to control the server.
 * @param {"human"|"json"|function} [options.reporter="human"]
 *                                  Report process/errors to CLI in bunyan JSON
 *                                  or in human readable format. It can be also
 *                                  a function to show current server status.
 * @param {Logger} [options.bunyan] Bunyan logger with custom settings.
 * @param {Store} [options.store] Store to save log. Will be
 *                                {@link MemoryStore}, by default.
 * @param {"production"|"development"} [options.env] Development or production
 *                                                   server mode. By default,
 *                                                   it will be taken from
 *                                                   `NODE_ENV` environment
 *                                                   variable. On empty
 *                                                   `NODE_ENV` it will
 *                                                   be `"development"`.
 * @param {http.Server} [options.server] HTTP server to connect WebSocket
 *                                       server to it. Same as in `ws.Server`.
 * @param {number} [options.port=31337] Port to bind server. It will create
 *                                      HTTP server manually to connect
 *                                      WebSocket server to it.
 * @param {string} [options.host="127.0.0.1"] IP-address to bind server.
 * @param {string} [options.key] SSL key or path to it. Path could be relative
 *                               from server root. It is required in production
 *                               mode, because WSS is highly recommended.
 * @param {string} [options.cert] SSL certificate or path to it. Path could
 *                                be relative from server root. It is required
 *                                in production mode, because WSS
 *                                is highly recommended.
 *
 * @example
 * const { Server } = require('@logux/server')
 *
 * const env = process.env.NODE_ENV || 'development'
 * const envOptions = {}
 * if (env === 'production') {
 *   envOptions.cert = 'cert.pem'
 *   envOptions.key = 'key.pem'
 * }
 *
 * const server = new Server(Object.assign({
 *   subprotocol: '1.0.0',
 *   supports: '1.x || 0.x',
 *   root: __dirname
 * }, envOptions))
 *
 * server.listen()
 *
 * @extends BaseServer
 */
class Server extends BaseServer {
  /**
   * Load options from command-line arguments and/or environment
   *
   * @param {object} process Current process object.
   * @param {object} defaults Default server options. Arguments and environment
   *                          variables will override them.
   * @return {object} Parsed options object.
   *
   * @example
   * const server = new Server(Server.loadOptions(process, {
   *   subprotocol: '1.0.0',
   *   supports: '1.x',
   *   root: __dirname,
   *   port: 31337
   * }))
   */
  static loadOptions (process, defaults = { }) {
    let argv = yargs.parse(process.argv)
    let opts = { }

    for (let name of AVAILABLE_OPTIONS) {
      let arg = name.replace(/[A-Z]/g, char => '-' + char.toLowerCase())
      opts[name] = argv[arg] ||
                   process.env[ENVS[name]] ||
                   defaults[name]
    }

    opts.port = parseInt(opts.port, 10)
    opts.controlPort = parseInt(opts.controlPort, 10)

    return opts
  }

  constructor (options) {
    if (!options) options = { }

    if (typeof options.reporter !== 'function') {
      options.reporter = options.reporter || 'human'
      options.reporter = createReporter(options)
    }

    let initialized = false
    let onError = err => {
      if (initialized) {
        this.emitter.emit('fatal', err)
      } else {
        options.reporter('error', { err, fatal: true })
        process.exit(1)
      }
    }
    process.on('uncaughtException', onError)
    process.on('unhandledRejection', onError)

    super(options)

    this.on('fatal', () => {
      if (initialized) {
        if (!this.destroying) {
          this.destroy().then(() => {
            process.exit(1)
          })
        }
      } else {
        process.exit(1)
      }
    })

    for (let name in options) {
      if (AVAILABLE_OPTIONS.indexOf(name) === -1) {
        let error = new Error(
          `Unknown option \`${ name }\` in server constructor`)
        error.code = 'LOGUX_UNKNOWN_OPTION'
        error.option = name
        throw error
      }
    }

    initialized = true

    let onExit = () => {
      this.destroy().then(() => {
        process.exit(0)
      })
    }
    process.on('SIGINT', onExit)

    this.unbind.push(() => {
      process.removeListener('SIGINT', onExit)
    })
  }

  listen (...args) {
    return BaseServer.prototype.listen.apply(this, args).catch(err => {
      this.reporter('error', { err })
      process.exit(1)
    })
  }
}

module.exports = Server
