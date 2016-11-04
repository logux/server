var WebSocket = require('ws')
var https = require('https')
var http = require('http')

var promisify = require('./promisify')

/**
 * Basic Logux Server API.
 *
 * @param {string|number} host Unique server ID.
 * @param {object} options Server options.
 * @param {"production"|"development"} [options.env] Development or production
 *                                                   server mode. By default,
 *                                                   it will be taken from
 *                                                   `NODE_ENV` environment
 *                                                   variable. On empty
 *                                                   `NODE_ENV` it will
 *                                                   be `"development"`.
 *
 * @example
 * import { BaseServer } from 'logux-server'
 * const app = new BaseServer('server')
 * app.listen()
 *
 * @class
 */
function BaseServer (host, options) {
  if (!host) {
    throw new Error('Missed unique host ID')
  }
  /**
   * Unique server ID.
   * @type {string|number}
   */
  this.host = host

  if (!options) options = { }

  /**
   * Production or development mode.
   * @type {"production"|"development"}
   */
  this.env = options.env || process.env.NODE_ENV || 'development'
  this.unbind = []
}

BaseServer.prototype = {

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
   * @param {string} [option.key] SSL key content. It is required in production
   *                              mode, because WSS is highly recommended.
   * @param {string} [option.cert] SSL certificate content It is required
   *                               in production mode, because WSS
   *                               is highly recommended.
   *
   * @return {Promise} When the server has been bound
   *
   * @example
   * app.listen({ cert: certFile, key: keyFile })
   */
  listen: function listen (options) {
    this.options = { }
    if (!options) options = { }
    /**
     * Options used to start server.
     * @type {object}
     */
    this.options = options

    var app = this
    var promise
    if (this.options.server) {
      this.ws = new WebSocket.Server({ server: this.options.server })
      promise = Promise.resolve()
    } else {
      if (!this.options.port) this.options.port = 1337
      if (!this.options.host) this.options.host = '127.0.0.1'

      if (this.env === 'production') {
        if (!this.options.key || !this.options.cert) {
          throw new Error('SSL is required in production mode. ' +
                          'Set key and cert options or use server option.')
        }
      }

      if (this.options.cert) {
        this.http = https.createServer({
          cert: this.options.cert,
          key: this.options.key
        })
      } else {
        this.http = http.createServer()
      }

      this.ws = new WebSocket.Server({
        server: this.http
      })

      promise = promisify(function (done) {
        app.http.listen(app.options.port, app.options.host, done)
      })
      this.unbind.push(function () {
        return promisify(function (done) {
          promise.then(function () {
            app.http.close(done)
          })
        })
      })
    }

    this.unbind.push(function () {
      return promisify(function (done) {
        app.ws.close(done)
      })
    })

    return promise
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
    return Promise.all(this.unbind.map(function (unbind) {
      return unbind()
    }))
  }

}

module.exports = BaseServer
