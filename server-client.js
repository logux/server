'use strict'

const SyncError = require('logux-sync').SyncError
const semver = require('semver')

const FilteredSync = require('./filtered-sync')
const forcePromise = require('./force-promise')
const ALLOWED_META = require('./allowed-meta')

function reportDetails (client) {
  return {
    subprotocol: client.sync.remoteSubprotocol,
    clientId: client.key,
    nodeId: client.nodeId
  }
}

function reportClient (client, obj) {
  if (!obj) obj = { }
  if (client.nodeId) {
    obj.nodeId = client.nodeId
  } else {
    obj.clientId = client.key
  }
  return obj
}

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
class ServerClient {
  constructor (app, connection, key) {
    this.app = app

    /**
     * User ID. It will be filled from client’s node ID.
     * It will be undefined before correct authentication.
     * @type {string|undefined}
     */
    this.userId = undefined

    /**
     * Unique client’s node ID.
     * It will be undefined before correct authentication.
     * @type {string|undefined}
     */
    this.nodeId = undefined

    /**
     * Does server process some action from client.
     * @type {boolean}
     *
     * @example
     * console.log('Clients in processing:', clients.map(i => i.processing))
     */
    this.processing = false

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
    this.remoteAddress = connection.ws._socket.remoteAddress

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
    this.sync = new FilteredSync(this, app.nodeId, app.log, connection, {
      credentials,
      subprotocol: app.options.subprotocol,
      inFilter: this.filter.bind(this),
      timeout: app.options.timeout,
      outMap: this.outMap.bind(this),
      inMap: this.inMap.bind(this),
      ping: app.options.ping,
      auth: this.auth.bind(this)
    })

    this.sync.catch(err => {
      this.app.reporter('error', reportClient(this, { err }))
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
        this.app.reporter('error', reportClient(this, { err }))
      }
    })

    app.reporter('connect', {
      clientId: this.key,
      ipAddress: this.remoteAddress
    })
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
    if (!this.app.destroying && !this.zombie) {
      this.app.reporter('disconnect', reportClient(this))
    }
    this.sync.destroy()
    if (this.userId) {
      let users = this.app.users[this.userId]
      if (users) {
        users = users.filter(i => i !== this)
        if (users.length === 0) {
          delete this.app.users[this.userId]
        } else {
          this.app.users[this.userId] = users
        }
      }
    }
    if (this.nodeId) {
      delete this.app.nodeIds[this.nodeId]
      for (const i in this.app.subscribers) {
        delete this.app.subscribers[i][this.nodeId]
        if (Object.keys(this.app.subscribers[i]).length === 0) {
          delete this.app.subscribers[i]
        }
      }
    }
    delete this.app.clients[this.key]
  }

  auth (credentials, nodeId) {
    this.nodeId = nodeId

    const userId = this.app.getUserId(nodeId)
    if (userId === 'server') {
      this.app.reporter('unauthenticated', reportDetails(this))
      return Promise.resolve(false)
    }
    if (typeof userId !== 'undefined') this.userId = userId

    return this.app.authenticator(this.userId, credentials, this)
      .then(result => {
        if (this.attempts() >= 3) {
          return Promise.reject(new SyncError(this.sync, 'bruteforce'))
        }

        if (result) {
          const zombie = this.app.nodeIds[this.nodeId]
          if (zombie) {
            zombie.zombie = true
            this.app.reporter('zombie', { nodeId: zombie.nodeId })
            zombie.destroy()
          }
          delete this.app.authAttempts[this.remoteAddress]
          this.app.nodeIds[this.nodeId] = this
          if (this.userId) {
            if (!this.app.users[this.userId]) this.app.users[this.userId] = []
            this.app.users[this.userId].push(this)
          }
          this.app.reporter('authenticated', reportDetails(this))
        } else {
          this.app.reporter('unauthenticated', reportDetails(this))
          this.app.authAttempts[this.remoteAddress] = this.attempts() + 1
          this.app.setTimeout(() => {
            if (this.attempts() === 1) {
              delete this.app.authAttempts[this.remoteAddress]
            } else {
              this.app.authAttempts[this.remoteAddress] -= 1
            }
          }, 3000)
        }
        return result
      })
  }

  attempts () {
    return this.app.authAttempts[this.remoteAddress] || 0
  }

  outMap (action, meta) {
    return Promise.resolve([action, { id: meta.id, time: meta.time }])
  }

  inMap (action, meta) {
    if (!meta.subprotocol) {
      meta.subprotocol = this.sync.remoteSubprotocol
    }
    return Promise.resolve([action, meta])
  }

  filter (action, meta) {
    const creator = this.app.createCreator(meta)

    const wrongUser = this.userId && this.userId !== creator.userId
    const wrongMeta = Object.keys(meta).some(i => {
      return ALLOWED_META.indexOf(i) === -1
    })
    if (wrongUser || wrongMeta) {
      this.app.denyAction(meta)
      return Promise.resolve(false)
    }

    const type = action.type
    if (type === 'logux/subscribe' || type === 'logux/unsubscribe') {
      return Promise.resolve(true)
    }

    const processor = this.app.types[type]
    if (!processor) {
      this.app.unknownType(action, meta)
      return Promise.resolve(false)
    }

    return forcePromise(() => processor.access(action, meta, creator))
      .then(result => {
        if (!result) this.app.denyAction(meta)
        return result
      }).catch(e => {
        this.app.undo(meta, 'error')
        this.app.emitter.emit('error', e, action, meta)
      })
  }
}

module.exports = ServerClient
