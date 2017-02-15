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
 * var client = app.clients[0]
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

  var credentials
  if (this.app.env === 'development') {
    credentials = { env: 'development' }
  }

  /**
   * Sync instance from `logux-sync` to synchronize logs.
   * @type {ServerSync}
   *
   * @example
   * if (client.sync.state === 'synchronized')
   */
  this.sync = new ServerSync(app.nodeId, app.log, connection, {
    credentials: credentials,
    subprotocol: app.options.subprotocol,
    timeout: app.options.timeout,
    inMap: this.map.bind(this),
    ping: app.options.ping,
    auth: this.auth.bind(this)
  })

  var client = this

  this.sync.catch(err => {
    client.app.reporter('syncError', client.app, client, err)
  })
  this.sync.on('connect', () => {
    if (!client.isSubprotocol(client.app.options.supports)) {
      throw new SyncError(client.sync, 'wrong-subprotocol', {
        supported: client.app.options.supports,
        used: client.sync.remoteSubprotocol
      })
    }
  })
  this.sync.on('state', () => {
    if (!client.sync.connected && !client.destroyed) client.destroy()
  })
  this.sync.on('clientError', err => {
    if (err.type !== 'wrong-credentials') {
      client.app.reporter('clientError', client.app, client, err)
    }
  })
}

Client.prototype = {

  /**
   * Developer defined user object.
   * @type {object}
   */
  user: undefined,

  /**
   * User ID. It will be filled from client’s node ID.
   *
   */
  id: undefined,

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
    return semver.satisfies(this.sync.remoteSubprotocol, range)
  },

  /**
   * Disconnect client.
   *
   * @return {undefined}
   */
  destroy: function destroy () {
    this.destroyed = true
    if (!this.app.destroing) this.app.reporter('disconnect', this.app, this)
    if (this.sync.connected) this.sync.destroy()
    delete this.app.clients[this.key]
  },

  auth: function auth (credentials, nodeId) {
    /**
     * Unique node name.
     * @type {string|number}
     */
    this.nodeId = nodeId

    var pos = nodeId.indexOf(':')
    if (pos !== -1) {
      this.id = nodeId.slice(0, pos)
    }

    var client = this
    return this.app.authenticator(this.id, credentials, this)
      .then(user => {
        if (user) {
          client.user = user
          client.app.reporter('authenticated', client.app, client)
          return true
        } else {
          client.app.reporter('unauthenticated', client.app, client)
          return false
        }
      })
  },

  map: function map (action, meta) {
    meta.user = this.id
    meta.server = this.app.options.nodeId
    return [action, meta]
  }

}

module.exports = Client
