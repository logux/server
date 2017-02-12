const ServerConnection = require('logux-sync').ServerConnection
const MemoryStore = require('logux-core').MemoryStore
const WebSocket = require('ws')
const shortid = require('shortid')
const https = require('https')
const yargs = require('yargs')
const http = require('http')
const path = require('path')
const Log = require('logux-core').Log
const fs = require('fs')

const remoteAddress = require('./remote-address')
const promisify = require('./promisify')
const Client = require('./client')

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
yargs.argv

const PEM_PREAMBLE = '-----BEGIN'

function isPem (content) {
  if (typeof content === 'object' && content.pem) {
    return true
  } else {
    return content.toString().trim().indexOf(PEM_PREAMBLE) === 0
  }
}

function readFile (root, file) {
  file = file.toString()
  if (!path.isAbsolute(file)) {
    file = path.join(root, file)
  }
  return promisify((done) => {
    fs.readFile(file, done)
  })
}

/**
 * Basic Logux Server API without good UI. Use it only if you need
 * to create some special hacks on top of Logux Server.
 *
 * In most use cases you should use {@link Server}.
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
 * @param {Store} [options.store] Store to save log. Will be `MemoryStore`,
 *                                by default.
 * @param {"production"|"development"} [options.env] Development or production
 *                                                   server mode. By default,
 *                                                   it will be taken from
 *                                                   `NODE_ENV` environment
 *                                                   variable. On empty
 *                                                   `NODE_ENV` it will
 *                                                   be `"development"`.
 * @param {number} [options.pid] Process ID, to display in reporter.
 * @param {function} [reporter] Function to show current server status.
 *
 * @example
 * import { BaseServer } from 'logux-server'
 * class MyLoguxHack extends BaseServer {
 *   …
 * }
 *
 * @class
 */
function BaseServer (options, reporter) {
  /**
   * Server options.
   * @type {object}
   *
   * @example
   * console.log(app.options.nodeId + ' was started')
   */
  this.options = options || { }

  this.reporter = reporter || function () { }

  if (typeof this.options.subprotocol === 'undefined') {
    throw new Error('Missed subprotocol version')
  }
  if (typeof this.options.supports === 'undefined') {
    throw new Error('Missed supported subprotocol major versions')
  }

  if (typeof this.options.nodeId === 'undefined') {
    this.options.nodeId = `'server: ${ shortid.generate() }`
  }

  this.options.root = this.options.root || process.cwd()

  const store = this.options.store || new MemoryStore()

  /**
   * Server actions log.
   * @type {Log}
   *
   * @example
   * app.log.each(finder)
   */
  this.log = new Log({ store: store, nodeId: this.options.nodeId })

  /**
   * Production or development mode.
   * @type {"production"|"development"}
   *
   * @example
   * if (app.env === 'development') {
   *   logDebugData()
   * }
   */
  this.env = this.options.env || process.env.NODE_ENV || 'development'

  this.unbind = []

  /**
   * Connected clients.
   * @type {Client[]}
   *
   * @example
   * for (let nodeId in app.clients) {
   *   console.log(app.clients[nodeId].remoteAddress)
   * }
   */
  this.clients = { }

  this.lastClient = 0

  const app = this
  this.unbind.push(() => {
    for (const i in app.clients) {
      app.clients[i].destroy()
    }
  })
}

BaseServer.prototype = {

  /**
   * Set authenticate function. It will receive client credentials
   * and node ID. It should return a Promise with `false`
   * on bad authentication or with {@link User} on correct credentials.
   *
   * @param {authenticator} authenticator The authentication callback.
   *
   * @return {undefined}
   *
   * @example
   * app.auth(token => {
   *   return findUserByToken(token).then(user => {
   *     return user.blocked ? false : user
   *   })
   * })
   */
  auth: function auth (authenticator) {
    this.authenticator = authenticator
  },

  /**
   * Start WebSocket server and listen for clients.
   *
   * @param {object} options Connection options.
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
   * @return {Promise} When the server has been bound.
   *
   * @example
   * app.listen({ cert: 'cert.pem', key: 'key.pem' })
   */
  listen: function listen (options) {
    /**
     * Options used to start server.
     * @type {object}
     */
    this.listenOptions = options || { }

    if (this.listenOptions.key && !this.listenOptions.cert) {
      throw new Error('You must set cert option too if you use key option')
    }
    if (!this.listenOptions.key && this.listenOptions.cert) {
      throw new Error('You must set key option too if you use cert option')
    }

    if (!this.authenticator) {
      throw new Error('You must set authentication callback by app.auth()')
    }

    if (!this.listenOptions.server) {
      if (!this.listenOptions.port) this.listenOptions.port = 1337
      if (!this.listenOptions.host) this.listenOptions.host = '127.0.0.1'
    }

    const app = this
    let promise = Promise.resolve()

    if (this.listenOptions.server) {
      this.ws = new WebSocket.Server({ server: this.listenOptions.server })
    } else {
      const before = []
      if (this.listenOptions.key && !isPem(this.listenOptions.key)) {
        before.push(readFile(this.options.root, this.listenOptions.key))
      } else {
        before.push(Promise.resolve(this.listenOptions.key))
      }
      if (this.listenOptions.cert && !isPem(this.listenOptions.cert)) {
        before.push(readFile(this.options.root, this.listenOptions.cert))
      } else {
        before.push(Promise.resolve(this.listenOptions.cert))
      }

      promise = promise.then(() => {
        return Promise.all(before)
      }).then((keys) => {
        return new Promise((resolve, reject) => {
          if (keys[0]) {
            app.http = https.createServer({ key: keys[0], cert: keys[1] })
          } else {
            app.http = http.createServer()
          }

          app.ws = new WebSocket.Server({ server: app.http })

          app.ws.on('error', reject)

          const opts = app.listenOptions
          app.http.listen(opts.port, opts.host, resolve)
        })
      })
    }

    app.unbind.push(() => {
      return promisify((done) => {
        promise.then(() => {
          app.ws.close(() => {
            if (app.http) {
              app.http.close(done)
            } else {
              done()
            }
          })
        })
      })
    })

    return promise.then(() => {
      app.ws.on('connection', (ws) => {
        app.reporter('connect', app, remoteAddress(ws))
        app.lastClient += 1
        const client = new Client(app, new ServerConnection(ws), app.lastClient)
        app.clients[app.lastClient] = client
      })
    }).then(() => {
      app.reporter('listen', app)
    })
  },

  /**
   * Stop server and unbind all listeners.
   *
   * @return {Promise} Promise when all listeners will be removed.
   *
   * @example
   * afterEach(() => {
   *   testApp.destroy()
   * })
   */
  destroy: function destroy () {
    this.destroing = true
    this.reporter('destroy', this)
    return Promise.all(this.unbind.map((unbind) => {
      return unbind()
    }))
  },

  /**
   * Load options from command-line arguments and/or environment
   *
   * @param {object} process Current process object.
   * @param {object} defaults Default options.
   * @return {object} Parsed options object.
   *
   * @example
   * app.listen(app.loadOptions(process, { port: 31337 }))
   */
  loadOptions: function loadOptions (process, defaults) {
    defaults = defaults || { }

    const argv = yargs.parse(process.argv)
    const env = process.env

    return {
      host: argv.h || env.LOGUX_HOST || defaults.host,
      port: parseInt(argv.p || env.LOGUX_PORT || defaults.port, 10),
      cert: argv.c || env.LOGUX_CERT || defaults.cert,
      key: argv.k || env.LOGUX_KEY || defaults.key
    }
  }

}

module.exports = BaseServer

/**
 * @callback authenticator
 * @param {any} credentials The client credentials.
 * @param {string|number} nodeId Unique client node name.
 * @param {Client} client Client object.
 * @return {Promise} Promise with `false` or {@link User} data.
 */

/**
 * Developer defined user data. It is open structure. But you should define
 * at least `id` property to show it in logs.
 *
 * @typedef {object} User
 *
 * @property {string|number} id Any user ID to display in server logs.
 */
