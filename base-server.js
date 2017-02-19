var ServerConnection = require('logux-sync').ServerConnection
var MemoryStore = require('logux-core').MemoryStore
var WebSocket = require('ws')
var shortid = require('shortid')
var https = require('https')
var yargs = require('yargs')
var http = require('http')
var path = require('path')
var Log = require('logux-core').Log
var fs = require('fs')

var remoteAddress = require('./remote-address')
var promisify = require('./promisify')
var Client = require('./client')

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

var PEM_PREAMBLE = '-----BEGIN'

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
  return promisify(done => {
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
    this.options.nodeId = `server:${ shortid.generate() }`
  }

  this.options.root = this.options.root || process.cwd()

  var store = this.options.store || new MemoryStore()

  /**
   * Server actions log.
   * @type {Log}
   *
   * @example
   * app.log.each(finder)
   */
  this.log = new Log({ store, nodeId: this.options.nodeId })

  this.log.on('before', (action, meta) => {
    if (!meta.server) meta.server = this.options.nodeId
  })

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
  this.actions = { }

  this.lastClient = 0

  var app = this
  this.unbind.push(() => {
    for (var i in app.clients) {
      app.clients[i].destroy()
    }
  })
}

BaseServer.prototype = {

  /**
   * Set authenticate function. It will receive client credentials
   * and node ID. It should return a Promise with `false`
   * on bad authentication or with any user data on correct credentials.
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

    var app = this
    var promise = Promise.resolve()

    if (this.listenOptions.server) {
      this.ws = new WebSocket.Server({ server: this.listenOptions.server })
    } else {
      var before = []
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

      promise = promise
        .then(() => Promise.all(before))
        .then(keys => new Promise((resolve, reject) => {
          if (keys[0]) {
            app.http = https.createServer({ key: keys[0], cert: keys[1] })
          } else {
            app.http = http.createServer()
          }

          app.ws = new WebSocket.Server({ server: app.http })

          app.ws.on('error', reject)

          var opts = app.listenOptions
          app.http.listen(opts.port, opts.host, resolve)
        }))
    }

    app.unbind.push(() => promisify(done => {
      promise.then(() => {
        app.ws.close(() => {
          if (app.http) {
            app.http.close(done)
          } else {
            done()
          }
        })
      })
    }))

    return promise.then(() => {
      app.ws.on('connection', ws => {
        app.reporter('connect', app, remoteAddress(ws))
        app.lastClient += 1
        var client = new Client(app, new ServerConnection(ws), app.lastClient)
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
    return Promise.all(this.unbind.map(i => i()))
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

    var argv = yargs.parse(process.argv)
    var env = process.env

    return {
      host: argv.h || env.LOGUX_HOST || defaults.host,
      port: parseInt(argv.p || env.LOGUX_PORT || defaults.port, 10),
      cert: argv.c || env.LOGUX_CERT || defaults.cert,
      key: argv.k || env.LOGUX_KEY || defaults.key
    }
  },

  /**
   * Define action type’s callbacks.
   *
   * @param {string} name The action’s type.
   * @param {object} callbacks Callbacks for actions with this type.
   * @param {authorizer} callback.access Check does user can do this action.
   * @param {processor} callback.process Action business logic.
   *
   * @return {undefined}
   *
   * @example
   * app.type('CHANGE_NAME', {
   *   access (action, meta, user) {
   *     return Promise.resolve(action.user === user.id)
   *   },
   *   process (action, meta) {
   *     if (isFirstOlder(lastNameChange(action.user), meta)) {
   *       return db.changeUserName({ id: action.user, name: action.name })
   *     }
   *   }
   * })
   */
  type: function type (name, callbacks) {
    if (this.actions[name]) {
      throw new Error(`Action type ${ name } was already defined`)
    }
    if (!callbacks || !callbacks.access) {
      throw new Error(`Action type ${ name } must have access callback`)
    }
    if (!callbacks.process) {
      throw new Error(`Action type ${ name } must have process callback`)
    }
    this.actions[name] = callbacks
  }

}

module.exports = BaseServer

/**
 * @callback authenticator
 * @param {string} id User ID.
 * @param {any} credentials The client credentials.
 * @param {Client} client Client object.
 * @return {Promise} Promise with `false` or user data.
 */

/**
 * @callback authorizer
 * @param {Action} action The action data.
 * @param {Meta} action The action metadata.
 * @param {Client} client The client object.
 * @return {Promise} Promise with `true` if client are allowed
 *                   to use this action.
 */

/**
 * @callback processor
 * @param {Action} action The action data.
 * @param {Meta} action The action metadata.
 * @param {Client} client The client object.
 * @return {Promise} Promise when processing will be finished.
 */
