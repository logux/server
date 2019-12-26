let { LoguxError } = require('@logux/core')
let semver = require('semver')

let FilteredNode = require('./filtered-node')
let ALLOWED_META = require('./allowed-meta')
let parseNodeId = require('./parse-node-id')

const RESEND_META = [
  'channel', 'channels',
  'user', 'users',
  'client', 'clients',
  'node', 'nodes'
]

function reportDetails (client) {
  return {
    connectionId: client.key,
    subprotocol: client.node.remoteSubprotocol,
    nodeId: client.nodeId
  }
}

function reportClient (client, obj) {
  if (client.nodeId) {
    obj.nodeId = client.nodeId
  } else {
    obj.connectionId = client.key
  }
  return obj
}

/**
 * Logux client connected to server.
 *
 * @param {Server} app The server.
 * @param {ServerConnection} connection The Logux connection.
 * @param {number} key Client number used as `app.connected` key.
 *
 * @example
 * const client = server.connected[0]
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
     * Unique persistence machine ID.
     * It will be undefined before correct authentication.
     * @type {string|undefined}
     */
    this.clientId = undefined

    /**
     * Unique node ID.
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
     * Client number used as `app.connected` key.
     * @type {string}
     *
     * @example
     * function stillConnected (client) {
     *   return !!app.connected[client.key]
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
        throw new LoguxError('wrong-subprotocol', {
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

    this.app.emitter.emit('connected', this)
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
    this.node.destroy()
    if (this.userId) {
      let users = this.app.userIds[this.userId]
      if (users) {
        users = users.filter(i => i !== this)
        if (users.length === 0) {
          delete this.app.userIds[this.userId]
        } else {
          this.app.userIds[this.userId] = users
        }
      }
    }
    if (this.clientId) {
      delete this.app.clientIds[this.clientId]
      delete this.app.nodeIds[this.nodeId]
      for (let i in this.app.subscribers) {
        delete this.app.subscribers[i][this.nodeId]
        if (Object.keys(this.app.subscribers[i]).length === 0) {
          delete this.app.subscribers[i]
        }
      }
    }
    if (!this.app.destroying) {
      this.app.emitter.emit('disconnected', this)
    }
    delete this.app.connected[this.key]
  }

  async auth (credentials, nodeId) {
    this.nodeId = nodeId
    let data = parseNodeId(nodeId)
    this.clientId = data.clientId
    this.userId = data.userId

    if (nodeId === 'server' || data.userId === 'server') {
      this.app.reporter('unauthenticated', reportDetails(this))
      return false
    }

    let start = Date.now()
    let result = await this.app.authenticator(this.userId, credentials, this)

    if (this.app.isBruteforce(this.remoteAddress)) {
      throw new LoguxError('bruteforce')
    }

    if (result) {
      let zombie = this.app.clientIds[this.clientId]
      if (zombie) {
        zombie.zombie = true
        this.app.reporter('zombie', { nodeId: zombie.nodeId })
        zombie.destroy()
      }
      this.app.clientIds[this.clientId] = this
      this.app.nodeIds[this.nodeId] = this
      if (this.userId) {
        if (!this.app.userIds[this.userId]) {
          this.app.userIds[this.userId] = []
        }
        this.app.userIds[this.userId].push(this)
      }
      this.app.emitter.emit('authenticated', this, Date.now() - start)
      this.app.reporter('authenticated', reportDetails(this))
    } else {
      this.app.reporter('unauthenticated', reportDetails(this))
      this.app.rememberBadAuth(this.remoteAddress)
    }
    return result
  }

  async outMap (action, meta) {
    return [action, { id: meta.id, time: meta.time }]
  }

  async inMap (action, meta) {
    if (!meta.subprotocol) {
      meta.subprotocol = this.node.remoteSubprotocol
    }

    for (let i of RESEND_META) delete meta[i]

    let type = action.type
    if (type !== 'logux/subscribe' && type !== 'logux/unsubscribe') {
      let processor = this.app.getProcessor(type)
      if (processor && processor.resend) {
        let ctx = this.app.createContext(meta)
        try {
          let keys = await processor.resend(ctx, action, meta)
          if (typeof keys === 'string') {
            keys = { channel: keys }
          } else if (Array.isArray(keys)) {
            keys = { channels: keys }
          }
          if (keys) {
            for (let i of RESEND_META) {
              if (keys[i]) meta[i] = keys[i]
            }
          }
        } catch (e) {
          this.app.undo(meta, 'error')
          this.app.emitter.emit('error', e, action, meta)
          this.app.finally(processor, ctx, action, meta)
          return [false, false]
        }
      }
    }

    return [action, meta]
  }

  async filter (action, meta) {
    if (!action) return false
    let ctx = this.app.createContext(meta)

    let wrongUser = !this.clientId || this.clientId !== ctx.clientId
    let wrongMeta = Object.keys(meta).some(i => {
      return !ALLOWED_META.includes(i) && !RESEND_META.includes(i)
    })
    if (wrongUser || wrongMeta) {
      this.app.denyAction(meta)
      return false
    }

    let type = action.type
    if (type === 'logux/subscribe' || type === 'logux/unsubscribe') {
      return true
    }

    let processor = this.app.getProcessor(type)
    if (!processor) {
      this.app.internalUnkownType(action, meta)
      return false
    }

    try {
      let result = await processor.access(ctx, action, meta)
      if (this.app.unknownTypes[meta.id]) {
        delete this.app.unknownTypes[meta.id]
        return false
      } else if (!result) {
        this.app.denyAction(meta)
        return false
      } else {
        return true
      }
    } catch (e) {
      this.app.undo(meta, 'error')
      this.app.emitter.emit('error', e, action, meta)
      this.app.finally(processor, ctx, action, meta)
      return false
    }
  }
}

module.exports = ServerClient
