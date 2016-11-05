var WebSocket = require('ws')
var https = require('https')
var http = require('http')

var promisify = require('./promisify')

/**
 * Basic Logux Server API without good UI. Use it only if you need
 * to create some special hacks on top of Logux Server.
 *
 * In most use cases you should use {@link Server}.
 *
 * @param {object} options Server options.
 * @param {string|number} options.uniqName Unique server ID.
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
 * class MyLoguxHack extends BaseServer {
 *   …
 * }
 *
 * @class
 */
function BaseServer (options) {
  /**
   * Server options.
   * @type {object}
   */
  this.options = options || { }

  if (typeof this.options.uniqName === 'undefined') {
    throw new Error('Missed unique node name')
  }

  /**
   * Production or development mode.
   * @type {"production"|"development"}
   */
  this.env = this.options.env || process.env.NODE_ENV || 'development'

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

    var app = this
    var promise
    if (this.listenOptions.server) {
      this.ws = new WebSocket.Server({ server: this.listenOptions.server })
      promise = Promise.resolve()
    } else {
      if (!this.listenOptions.port) this.listenOptions.port = 1337
      if (!this.listenOptions.host) this.listenOptions.host = '127.0.0.1'

      if (this.env === 'production') {
        if (!this.listenOptions.key || !this.listenOptions.cert) {
          throw new Error('SSL is required in production mode. ' +
                          'Set key and cert options or use server option.')
        }
      }

      if (this.listenOptions.cert) {
        this.http = https.createServer({
          cert: this.listenOptions.cert,
          key: this.listenOptions.key
        })
      } else {
        this.http = http.createServer()
      }

      this.ws = new WebSocket.Server({
        server: this.http
      })

      promise = promisify(function (done) {
        app.http.listen(app.listenOptions.port, app.listenOptions.host, done)
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
