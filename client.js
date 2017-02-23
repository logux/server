'use strict'

var ServerSync = require('logux-sync').ServerSync
var SyncError = require('logux-sync').SyncError
var semver = require('semver')

/**
 * Logux client connected to server.
 *
 * @param {Server} app The server.
 * @param {ServerConnection} connection The Logux connection.
 * @param {number} key Client number used as `app.clients` key.
 *
 * @example
 * const client = app.clients[0]
 */
class Client {

  constructor (app, connection, key) {
    this.app = app

    /**
     * Developer defined user object.
     * @type {object}
     */
    this.user = undefined

    /**
     * User ID. It will be filled from client’s node ID.
     *
     */
    this.id = undefined

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
     * const clientCity = detectLocation(client.remoteAddress)
     */
    this.remoteAddress = connection.ws.upgradeReq.headers['x-forwarded-for'] ||
                         connection.ws.upgradeReq.connection.remoteAddress

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
      credentials,
      subprotocol: app.options.subprotocol,
      timeout: app.options.timeout,
      ping: app.options.ping,
      auth: this.auth.bind(this),
      inMap: (action, meta) => {
        meta.user = this.id
        return [action, meta]
      }
    })

    this.sync.catch(err => {
      this.app.reporter('syncError', this.app, this, err)
    })
    this.sync.on('connect', () => {
      if (!this.isSubprotocol(this.app.options.supports)) {
        throw new SyncError(this.sync, 'wrong-subprotocol', {
          supported: this.app.options.supports,
          used: this.sync.remoteSubprotocol
        })
      }
    })
    this.sync.on('state', () => {
      if (!this.sync.connected && !this.destroyed) this.destroy()
    })
    this.sync.on('clientError', err => {
      if (err.type !== 'wrong-credentials') {
        this.app.reporter('clientError', this.app, this, err)
      }
    })

    app.reporter('connect', app, this)
  }

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
  isSubprotocol (range) {
    return semver.satisfies(this.sync.remoteSubprotocol, range)
  }

  /**
   * Disconnect client.
   *
   * @return {undefined}
   */
  destroy () {
    this.destroyed = true
    if (!this.app.destroing) this.app.reporter('disconnect', this.app, this)
    if (this.sync.connected) this.sync.destroy()
    delete this.app.clients[this.key]
  }

  auth (credentials, nodeId) {
    /**
     * Unique node name.
     * @type {string|number}
     */
    this.nodeId = nodeId

    var pos = nodeId.indexOf(':')
    if (pos !== -1) {
      this.id = nodeId.slice(0, pos)
    }

    return this.app.authenticator(this.id, credentials, this)
      .then(user => {
        if (user) {
          this.user = user
          this.app.reporter('authenticated', this.app, this)
          return true
        } else {
          this.app.reporter('unauthenticated', this.app, this)
          return false
        }
      })
  }

}

module.exports = Client
