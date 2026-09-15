import { Log, MemoryStore, parseId, ServerConnection } from '@logux/core'
import { createNanoEvents } from 'nanoevents'
import { nanoid } from 'nanoid'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

import { addHttpPages } from '../add-http-pages/index.js'
import { createHttpServer } from '../create-http-server/index.js'
import {
  ActionRunner,
  getRegexType,
  normalizeChannel,
  normalizeType,
  wasNot403
} from '../processing/index.js'
import { Publisher } from '../publishing/index.js'
import { ServerClient } from '../server-client/index.js'
import { createPattern } from '../url-pattern/index.js'

const RESEND_META = ['channels', 'users', 'clients', 'nodes']

// The reports and the debug messages of the failures, which have a reason
const FAILURES = {
  denied: (action, meta) => [
    { actionId: meta.id },
    `Action "${meta.id}" was denied`
  ],
  unknownType: (action, meta) => [
    { actionId: meta.id, type: action.type },
    `Action with unknown type ${action.type}`
  ],
  wrongChannel: (action, meta) => [
    { actionId: meta.id, channel: action.channel },
    `Wrong channel name ${action.channel}`
  ]
}

function optionError(msg) {
  let error = new Error(msg)
  error.logux = true
  error.note = 'Check server constructor and Logux Server documentation'
  throw error
}

export { wasNot403 }

export class BaseServer {
  constructor(opts = {}) {
    this.options = opts
    this.env = this.options.env || process.env.NODE_ENV || 'development'
    if (typeof this.options.queueTimeout === 'undefined') {
      this.options.queueTimeout = 5 * 60 * 1000
    }

    if (typeof this.options.subprotocol === 'undefined') {
      throw optionError('Missed `subprotocol` option in server constructor')
    }
    if (typeof this.options.minSubprotocol === 'undefined') {
      throw optionError('Missed `minSubprotocol` option in server constructor')
    }

    if (this.options.key && !this.options.cert) {
      throw optionError('You must set `cert` option if you use `key` option')
    }
    if (!this.options.key && this.options.cert) {
      throw optionError('You must set `key` option if you use `cert` option')
    }

    if (!this.options.server) {
      if (!this.options.port) this.options.port = 31337
      if (!this.options.host) this.options.host = '127.0.0.1'
    }

    this.nodeId = `server:${this.options.id || nanoid(6)}`

    if (this.options.fileUrl) {
      this.options.root = dirname(fileURLToPath(this.options.fileUrl))
    }

    this.options.root = this.options.root || process.cwd()
    if (typeof this.options.port === 'string') {
      this.options.port = parseInt(this.options.port, 10)
    }

    let store = this.options.store || new MemoryStore()

    let log
    if (this.options.time) {
      log = this.options.time.nextLog({ nodeId: this.nodeId, store })
    } else {
      log = new Log({ nodeId: this.nodeId, store })
    }

    this.logger = console
    this.log = log

    let cleaned = {}

    this.on('preadd', (action, meta) => {
      this.prepareMeta(meta)
      // TODO: Remove the warning in next major
      let old = ['channel', 'client', 'node', 'user'].find(key => key in meta)
      if (old) {
        let message = `Replace meta.${old} with meta.${old}s`
        this.logger.warn({ actionId: meta.id }, message)
        this.debugActionError(meta, message)
      }
    })
    this.on('add', (action, meta) => {
      if (meta.reasons.length === 0) {
        cleaned[meta.id] = true
        this.emitter.emit('report', 'addClean', { action, meta })
      } else {
        this.emitter.emit('report', 'add', { action, meta })
      }
    })
    this.on('clean', (action, meta) => {
      if (cleaned[meta.id]) {
        delete cleaned[meta.id]
        return
      }
      this.emitter.emit('report', 'clean', { actionId: meta.id })
    })

    this.emitter = createNanoEvents()
    this.on('fatal', err => {
      this.emitter.emit('report', 'error', { err, fatal: true })
    })
    this.on('error', (err, action, meta) => {
      if (meta) {
        this.emitter.emit('report', 'error', { actionId: meta.id, err })
      } else if (err.nodeId) {
        this.emitter.emit('report', 'error', { err, nodeId: err.nodeId })
      } else if (err.connectionId) {
        this.emitter.emit('report', 'error', {
          connectionId: err.connectionId,
          err
        })
      }
      if (this.env === 'development') this.debugError(err)
    })
    this.on('clientError', err => {
      if (err.nodeId) {
        this.emitter.emit('report', 'clientError', { err, nodeId: err.nodeId })
      } else if (err.connectionId) {
        this.emitter.emit('report', 'clientError', {
          connectionId: err.connectionId,
          err
        })
      }
    })
    this.on('connected', client => {
      this.emitter.emit('report', 'connect', {
        connectionId: client.key,
        ipAddress: client.remoteAddress
      })
    })
    this.on('disconnected', client => {
      if (!client.zombie) {
        if (client.nodeId) {
          this.emitter.emit('report', 'disconnect', { nodeId: client.nodeId })
        } else {
          this.emitter.emit('report', 'disconnect', {
            connectionId: client.key
          })
        }
      }
    })

    this.unbind = []

    this.connected = new Map()
    this.nodeIds = new Map()
    this.clientIds = new Map()
    this.userIds = new Map()
    this.types = {}
    this.regexTypes = new Map()

    this.lastClient = 0

    this.channels = []
    this.subscribers = {}

    this.authAttempts = {}

    this.timeouts = {}
    this.lastTimeout = 0

    this.publisher = new Publisher(this)
    this.runner = new ActionRunner(this)

    this.on('batch', entries => {
      for (let [action, meta] of entries) {
        if (this.isUseless(action, meta)) {
          this.emitter.emit('report', 'useless', { action, meta })
        }
      }
      this.publisher.track(entries).catch(e => {
        this.emitter.emit('error', e)
      })
    })

    this.httpListeners = []
    this.httpAllListeners = []
    this.httpNotFoundListener = undefined
    addHttpPages(this)

    this.listenNotes = {}

    this.unbind.push(() => {
      for (let i of this.connected.values()) i.destroy()
      for (let i in this.timeouts) {
        clearTimeout(this.timeouts[i])
      }
    })
    this.unbind.push(async () => {
      await this.runner.waitForTasks()
      await this.publisher.settled()
      // The callbacks, which exceeded `queueTimeout`, can still be running
      if (this.runner.detached.size > 0) {
        this.emitter.emit('report', 'destroyDetached', {
          actions: this.runner.detached.size
        })
      }
    })
  }

  handleClient(ws, req) {
    ws.upgradeReq = req
    this.addClient(new ServerConnection(ws))
  }

  addClient(connection) {
    this.lastClient += 1
    let key = this.lastClient.toString()
    let client = new ServerClient(this, connection, key)
    this.connected.set(key, client)
    return this.lastClient
  }

  auth(authenticator) {
    this.authenticator = authenticator
  }

  channel(pattern, callbacks, options = {}) {
    let channel = normalizeChannel(
      `Channel ${pattern}`,
      callbacks,
      options.queue || 'main'
    )
    if (typeof pattern === 'string') {
      channel.pattern = createPattern(pattern)
    } else {
      channel.regexp = pattern
    }
    this.channels.push(channel)
  }

  debugActionError(meta, msg) {
    if (this.env === 'development') {
      let clientId = parseId(meta.id).clientId
      if (this.clientIds.has(clientId)) {
        this.clientIds.get(clientId).connection.send(['debug', 'error', msg])
      }
    }
  }

  debugError(error) {
    for (let i of this.connected.values()) {
      if (i.connection.connected) {
        try {
          i.connection.send(['debug', 'error', error.stack])
        } catch {}
      }
    }
  }

  destroy() {
    this.destroying = true
    this.emitter.emit('report', 'destroy')
    return Promise.all(this.unbind.map(i => i()))
  }

  drain(clientId) {
    let client = this.clientIds.get(clientId)
    if (!client) return Promise.resolve(false)
    return client.drain()
  }

  http(method, url, listener) {
    if (this.options.disableHttpServer) {
      throw new Error(
        '`server.http()` can not be called when `disableHttpServer` enabled'
      )
    }
    if (!url) {
      this.httpAllListeners.push(method)
    } else {
      let route = { listener, match: createPattern(url), method, url }
      let same = this.httpListeners.findIndex(i => {
        return i.method === method && i.url === url
      })
      if (same === -1) {
        this.httpListeners.push(route)
      } else {
        this.httpListeners[same] = route
      }
    }
  }

  httpNotFound(listener) {
    if (this.options.disableHttpServer) {
      throw new Error(
        '`server.httpNotFound()` can not be called when ' +
          '`disableHttpServer` enabled'
      )
    }
    this.httpNotFoundListener = listener
  }

  isBruteforce(ip) {
    let attempts = this.authAttempts[ip]
    return attempts && attempts >= 3
  }

  isUseless(action, meta) {
    if (action.type.startsWith('logux/')) return false
    if (this.otherProcessor) return false
    if (this.types[action.type] || getRegexType(this, action.type)) return false
    for (let i of RESEND_META) {
      if (Array.isArray(meta[i]) && meta[i].length > 0) return false
    }
    return true
  }

  async listen() {
    if (!this.authenticator) {
      throw new Error('You must set authentication callback by server.auth()')
    }
    this.httpServer = await createHttpServer(this.options)
    this.ws = new WebSocketServer({ server: this.httpServer })
    if (!this.options.server) {
      await new Promise((resolve, reject) => {
        this.ws.on('error', reject)
        this.httpServer.listen(this.options.port, this.options.host, resolve)
      })
    }

    let processing = 0
    let waiting
    this.unbind.push(() => {
      return new Promise(resolve => {
        let end = () => {
          this.ws.close(resolve)
          this.httpServer.close()
        }
        if (processing === 0) {
          end()
        } else {
          waiting = end
        }
      })
    })

    if (!this.options.disableHttpServer) {
      this.httpServer.on('request', async (req, res) => {
        if (this.destroying) {
          res.writeHead(503, { 'Content-Type': 'text/plain' })
          res.end('The server is shutting down\n')
          return
        }
        processing += 1
        await this.processHttp(req, res)
        processing -= 1
        if (processing === 0 && waiting) waiting()
      })
    }

    let pkg = JSON.parse(
      await readFile(join(import.meta.dirname, '..', 'package.json'))
    )

    this.ws.on('connection', (ws, req) => this.handleClient(ws, req))
    this.emitter.emit('report', 'listen', {
      cert: !!this.options.cert,
      environment: this.env,
      host: this.options.host,
      loguxServer: pkg.version,
      minSubprotocol: this.options.minSubprotocol,
      nodeId: this.nodeId,
      notes: this.listenNotes,
      port: this.options.port,
      redis: this.options.redis,
      server: !!this.options.server,
      subprotocol: this.options.subprotocol
    })
  }

  on(event, listener) {
    if (
      event === 'preadd' ||
      event === 'add' ||
      event === 'batch' ||
      event === 'clean'
    ) {
      return this.log.emitter.on(event, listener)
    } else {
      return this.emitter.on(event, listener)
    }
  }

  otherChannel(callbacks) {
    if (this.otherSubscriber) {
      throw new Error('Callbacks for unknown channel are already defined')
    }
    let channel = normalizeChannel('Unknown channel', callbacks, 'main')
    channel.pattern = name => [name]
    this.otherSubscriber = channel
  }

  otherType(callbacks) {
    if (this.otherProcessor) {
      throw new Error('Callbacks for unknown types are already defined')
    }
    this.otherProcessor = normalizeType('Unknown type', callbacks, 'main')
  }

  // The callbacks need the ID, time, server and subprotocol
  prepareMeta(meta, client) {
    if (typeof meta.id === 'undefined') {
      meta.id = this.log.generateId()
      if (typeof meta.time === 'undefined') meta.time = this.log.lastTime
    } else if (typeof meta.time === 'undefined') {
      meta.time = this.log.now()
    }
    if (typeof meta.reasons === 'undefined') meta.reasons = []
    if (!meta.server) meta.server = this.nodeId
    if (!meta.subprotocol) {
      if (meta.id.split(' ')[1] === this.nodeId) {
        meta.subprotocol = this.options.subprotocol
      } else if (client) {
        meta.subprotocol = client.node.remoteSubprotocol
      }
    }
  }

  process(action, meta = {}) {
    return this.runner.submit({ action, meta, trusted: true })
  }

  async processHttp(req, res) {
    let urlString = req.url
    if (/^\/\w+%3F/.test(urlString)) {
      urlString = decodeURIComponent(urlString)
    }
    let reqUrl = new URL(urlString, 'http://localhost')

    // Listeners are checked in the order they were added, like in Express
    for (let route of this.httpListeners) {
      if (route.method === req.method && route.match(reqUrl.pathname)) {
        await route.listener(req, res)
        return
      }
    }

    for (let listener of this.httpAllListeners) {
      let result = await listener(req, res)
      if (result === true) return
    }

    if (this.httpNotFoundListener) {
      await this.httpNotFoundListener(req, res)
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found\n')
    }
  }

  // `clientId` differs from the action’s author only for the actions,
  // which were sent with a foreign ID
  publishUndo(action, meta, reason, extra, clientId) {
    let undoMeta = {}
    if (meta.users) undoMeta.users = meta.users.slice(0)
    if (meta.nodes) undoMeta.nodes = meta.nodes.slice(0)
    if (meta.reasons) undoMeta.reasons = meta.reasons.slice(0)
    if (meta.channels) undoMeta.channels = meta.channels.slice(0)
    if (meta.excludeClients) {
      undoMeta.excludeClients = meta.excludeClients.slice(0)
    }
    undoMeta.clients = (meta.clients || []).concat([
      clientId || parseId(meta.id).clientId
    ])
    return this.log.add(
      { ...extra, action, id: meta.id, reason, type: 'logux/undo' },
      undoMeta
    )
  }

  rememberBadAuth(ip) {
    this.authAttempts[ip] = (this.authAttempts[ip] || 0) + 1
    this.setTimeout(() => {
      if (this.authAttempts[ip] === 1) {
        delete this.authAttempts[ip]
      } else {
        this.authAttempts[ip] -= 1
      }
    }, 3000)
  }

  sendWithoutProcess(action, meta) {
    return this.publisher.send([[action, meta]])
  }

  sendOnConnect(loader) {
    this.connectLoader = loader
  }

  setTimeout(callback, ms) {
    this.lastTimeout += 1
    let id = this.lastTimeout
    this.timeouts[id] = setTimeout(() => {
      delete this.timeouts[id]
      callback()
    }, ms)
  }

  async subscribe(nodeId, channel) {
    if (channel === '__proto__' || nodeId === '__proto__') return
    if (!this.subscribers[channel] || !this.subscribers[channel][nodeId]) {
      if (!this.subscribers[channel]) {
        this.subscribers[channel] = {}
      }
      this.subscribers[channel][nodeId] = { filters: { '{}': true } }
      await this.log.add(
        { channel, type: 'logux/subscribed' },
        {
          nodes: [nodeId]
        }
      )
    }
  }

  type(name, callbacks, options = {}) {
    if (typeof name === 'function') name = name.type
    let handler = normalizeType(
      `Action type ${name}`,
      callbacks,
      options.queue || 'main'
    )

    if (name instanceof RegExp) {
      this.regexTypes.set(name, handler)
    } else {
      if (this.types[name]) {
        throw new Error(`Action type ${name} was already defined`)
      }
      this.types[name] = handler
    }
  }

  reportFailure(reason, action, meta) {
    let failure = FAILURES[reason]
    if (!failure) return
    let [details, message] = failure(action, meta)
    this.emitter.emit('report', reason, details)
    this.debugActionError(meta, message)
  }

  undo(action, meta, reason = 'error', extra = {}) {
    this.reportFailure(reason, action, meta)
    let task = this.runner.byId.get(meta.id)
    if (task && !task.finished) {
      // The task answers the client with this outcome only once
      task.settle({ extra, reason, type: 'undo' })
      return Promise.resolve()
    }
    return this.publishUndo(action, meta, reason, extra)
  }

  unknownType(action, meta) {
    if (parseId(meta.id).userId === 'server') {
      this.reportFailure('unknownType', action, meta)
      return Promise.resolve()
    }
    return this.undo(action, meta, 'unknownType')
  }

  wrongChannel(action, meta) {
    return this.undo(action, meta, 'wrongChannel')
  }
}
