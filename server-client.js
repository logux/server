let SyncError = require('logux-core').SyncError
let semver = require('semver')

let FilteredNode = require('./filtered-node')
let forcePromise = require('./force-promise')
let ALLOWED_META = require('./allowed-meta')

function reportDetails (client) {
  return {
    subprotocol: client.node.remoteSubprotocol,
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
 * const client = server.clients[0]
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
     * Node instance to synchronize logs.
     * @type {ServerNode}
     *
     * @example
     * if (client.node.state === 'synchronized')
     */
    this.node = new FilteredNode(this, app.nodeId, app.log, connection, {
      credentials,
      subprotocol: app.options.subprotocol,
      inFilter: this.filter.bind(this),
      timeout: app.options.timeout,
      outMap: this.outMap.bind(this),
      inMap: this.inMap.bind(this),
      ping: app.options.ping,
      auth: this.auth.bind(this)
    })

    this.node.catch(err => {
      this.app.emitter.emit('error', reportClient(this, err))
    })
    this.node.on('connect', () => {
      if (!this.isSubprotocol(this.app.options.supports)) {
        throw new SyncError('wrong-subprotocol', {
          supported: this.app.options.supports,
          used: this.node.remoteSubprotocol
        })
      }
    })
    this.node.on('state', () => {
      if (!this.node.connected && !this.destroyed) this.destroy()
    })
    this.node.on('clientError', err => {
      if (err.type !== 'wrong-credentials') {
        this.app.emitter.emit('clientError', reportClient(this, err))
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
    return semver.satisfies(this.node.remoteSubprotocol, range)
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
    this.node.destroy()
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
      for (let i in this.app.subscribers) {
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

    let userId = this.app.getUserId(nodeId)
    if (userId === 'server') {
      this.app.reporter('unauthenticated', reportDetails(this))
      return Promise.resolve(false)
    }
    if (typeof userId !== 'undefined') this.userId = userId

    return this.app.authenticator(this.userId, credentials, this)
      .then(result => {
        if (this.attempts() >= 3) {
          return Promise.reject(new SyncError('bruteforce'))
        }

        if (result) {
          let zombie = this.app.nodeIds[this.nodeId]
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
      meta.subprotocol = this.node.remoteSubprotocol
    }
    if (meta.id.split(' ')[1] !== this.nodeId) {
      meta.proxy = this.nodeId
    }
    return Promise.resolve([action, meta])
  }

  filter (action, meta) {
    let ctx = this.app.createContext(meta)
    this.app.contexts[meta.id] = ctx

    let wrongUser = !this.userId ||
      this.userId !== ctx.userId ||
      (meta.proxy && this.app.getUserId(meta.proxy) !== ctx.userId)
    let wrongMeta = Object.keys(meta).some(i => {
      return ALLOWED_META.indexOf(i) === -1
    })
    if (wrongUser || wrongMeta) {
      this.app.denyAction(meta)
      return Promise.resolve(false)
    }

    let type = action.type
    if (type === 'logux/subscribe' || type === 'logux/unsubscribe') {
      return Promise.resolve(true)
    }

    let processor = this.app.types[type]
    if (!processor) {
      processor = this.app.otherProcessor
    }
    if (!processor) {
      this.app.internalUnkownType(action, meta)
      return Promise.resolve(false)
    }

    return forcePromise(() => processor.access(ctx, action, meta))
      .then(result => {
        if (this.app.unknownTypes[meta.id]) {
          delete this.app.unknownTypes[meta.id]
          return false
        } else if (!result) {
          this.app.denyAction(meta)
          return false
        } else {
          return true
        }
      }).catch(e => {
        this.app.undo(meta, 'error')
        this.app.emitter.emit('error', e, action, meta)
      })
  }
}

module.exports = ServerClient
