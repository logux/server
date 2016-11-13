var ServerSync = require('logux-sync').ServerSync

var remoteAddress = require('./remote-address')

/**
 * Logux client connected to server.
 *
 * @param {Server} app The server.
 * @param {ServerConnection} connection The Logux connection.
 * @param {number} key Client number used as `app.clients` key.
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
    supports: app.options.supports,
    timeout: app.options.timeout,
    ping: app.options.ping,
    auth: this.auth.bind(this)
  })

  var client = this

  this.sync.on('state', function () {
    if (!client.sync.connected && !client.destroyed) client.destroy()
  })
  this.sync.catch(function (err) {
    client.app.reporter('syncError', client.app, client, err)
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
