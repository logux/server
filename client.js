var ServerSync = require('logux-sync').ServerSync
var SyncError = require('logux-sync').SyncError
var semver = require('semver')

var remoteAddress = require('./remote-address')

/**
 * Logux client connected to server.
 *
 * @param {Server} app The server.
 * @param {ServerConnection} connection The Logux connection.
 * @param {number} key Client number used as `app.clients` key.
 *
 * @example
 * const client = app.clients[0]
 *
 * @class
 */
function Client (app, connection, key) {
  this.app = app

  /**
   * The Logux wrapper to WebSocket connection.
   * @type {ServerConnection}
   *
   * @example
   * console.log(client.connection.ws.upgradeReq.headers)
   */
  this.connection = connection

  /**
   * Client number used as `app.clients` key.
   * @type {string}
   *
   * @example
   * function stillConnected (client) {
   *   return !!app.clients[client.key]
   * }
   */
  this.key = key.toString()

  /**
   * Client IP address.
   * @type {string}
   *
   * @example
   * var clientCity = detectLocation(client.remoteAddress)
   */
  this.remoteAddress = remoteAddress(this.connection.ws)

  /**
   * Sync instance from `logux-sync` to synchronize logs.
   * @type {ServerSync}
   */
  this.sync = new ServerSync(app.nodeId, app.log, connection, {
    subprotocol: app.options.subprotocol,
    timeout: app.options.timeout,
    ping: app.options.ping,
    auth: this.auth.bind(this)
  })

  var client = this

  this.sync.catch(function (err) {
    client.app.reporter('syncError', client.app, client, err)
  })
  this.sync.on('connect', function () {
    if (!client.isSubprotocol(client.app.options.supports)) {
      throw new SyncError(client.sync, 'wrong-subprotocol', {
        supported: client.app.options.supports,
        used: client.sync.otherSubprotocol
      })
    }
  })
  this.sync.on('state', function () {
    if (!client.sync.connected && !client.destroyed) client.destroy()
  })
  this.sync.on('clientError', function (err) {
    client.app.reporter('clientError', client.app, client, err)
  })
}

Client.prototype = {

  /**
   * Developer defined user object. It should have at least
   * @type {object}
   */
  user: undefined,

  /**
   * Check client subprotocol version. It uses `semver` npm package
   * to parse requirements.
   *
   * @param {string} range npm’s version requirements.
   *
   * @return {boolean} Is version satisfies requirements.
   *
   * @example
   * if (client.isSubprotocol('4.x')) {
   *   useOldAPI()
   * }
   */
  isSubprotocol: function isSubprotocol (range) {
    return semver.satisfies(this.sync.otherSubprotocol, range)
  },

  /**
   * Disconnect client.
   *
   * @return {undefined}
   */
  destroy: function destroy () {
    this.destroyed = true
    this.app.reporter('disconnect', this.app, this)
    if (this.sync.connected) this.sync.destroy()
    delete this.app.clients[this.key]
  },

  auth: function auth (credentials, nodeId) {
    /**
     * Unique node name.
     * @type {string|number}
     */
    this.nodeId = nodeId

    var client = this
    return this.app.authenticator(credentials, nodeId, this)
      .then(function (user) {
        if (user) {
          client.user = user
          client.app.reporter('authenticated', client.app, client)
          return true
        } else {
          return false
        }
      })
  }

}

module.exports = Client
