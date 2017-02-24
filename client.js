'use strict'

const ServerSync = require('logux-sync').ServerSync
const SyncError = require('logux-sync').SyncError
const semver = require('semver')

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
     * User ID. It will be filled from client’s node ID.
     *
     */
    this.user = undefined

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

    let credentials
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
        meta.user = this.user
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
    if (this.user) delete this.app.users[this.user]
    delete this.app.clients[this.key]
  }

  auth (credentials, nodeId) {
    /**
     * Unique node name.
     * @type {string|number}
     */
    this.nodeId = nodeId

    const pos = nodeId.indexOf(':')
    if (pos !== -1) {
      this.user = nodeId.slice(0, pos)
      this.app.users[this.user] = this
    }

    return this.app.authenticator(this.user, credentials, this)
      .then(result => {
        if (result) {
          this.app.reporter('authenticated', this.app, this)
        } else {
          this.app.reporter('unauthenticated', this.app, this)
        }
        return result
      })
  }

}

module.exports = Client
