import { LoguxNotFoundError } from '@logux/actions'
import { Log, MemoryStore, parseId, ServerConnection } from '@logux/core'
import { createNanoEvents } from 'nanoevents'
import { nanoid } from 'nanoid'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import UrlPattern from 'url-pattern'
import { WebSocketServer } from 'ws'

import { addHttpPages } from '../add-http-pages/index.js'
import { Context } from '../context/index.js'
import { createHttpServer } from '../create-http-server/index.js'
import { ServerClient } from '../server-client/index.js'

const SKIP_PROCESS = Symbol('skipProcess')
const RESEND_META = ['channels', 'users', 'clients', 'nodes']

function optionError(msg) {
  let error = new Error(msg)
  error.logux = true
  error.note = 'Check server constructor and Logux Server documentation'
  throw error
}

export async function wasNot403(cb) {
  try {
    await cb()
    return true
  } catch (e) {
    if (e.name === 'ResponseError' && e.statusCode === 403) {
      return false
    }
    throw e
  }
}

function normalizeTypeCallbacks(name, callbacks) {
  if (callbacks && callbacks.accessAndProcess) {
    callbacks.access = (ctx, ...args) => {
      return wasNot403(async () => {
        await callbacks.accessAndProcess(ctx, ...args)
        ctx[SKIP_PROCESS] = true
      })
    }
    callbacks.process = async (ctx, ...args) => {
      if (!ctx[SKIP_PROCESS]) await callbacks.accessAndProcess(ctx, ...args)
    }
  }
  if (!callbacks || !callbacks.access) {
    throw new Error(`${name} must have access callback`)
  }
}

function normalizeChannelCallbacks(pattern, callbacks) {
  if (callbacks && callbacks.accessAndLoad) {
    callbacks.access = (ctx, ...args) => {
      return wasNot403(async () => {
        try {
          ctx.data.load = await callbacks.accessAndLoad(ctx, ...args)
        } catch (e) {
          if (e.name === 'LoguxNotFoundError') {
            ctx.data.notFound = true
          } else if (e.name === 'ResponseError' && e.statusCode === 404) {
            ctx.data.notFound = true
          } else {
            throw e
          }
        }
      })
    }
    callbacks.load = ctx => {
      if (ctx.data.notFound) {
        throw new LoguxNotFoundError()
      } else {
        return ctx.data.load
      }
    }
  }
  if (!callbacks || !callbacks.access) {
    throw new Error(`Channel ${pattern} must have access callback`)
  }
}

function subscriberFilterId(action) {
  return JSON.stringify(action.filter || {})
}

export class BaseServer {
  constructor(opts = {}) {
    this.options = opts
    this.env = this.options.env || process.env.NODE_ENV || 'development'

    if (typeof this.options.subprotocol === 'undefined') {
      throw optionError('Missed `subprotocol` option in server constructor')
    }
    if (typeof this.options.supports === 'undefined') {
      throw optionError('Missed `supports` option in server constructor')
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

    this.nodeId = `server:${this.options.id || nanoid(8)}`

    if (this.options.fileUrl) {
      this.options.root = dirname(fileURLToPath(this.options.fileUrl))
    }

    this.options.root = this.options.root || process.cwd()

    let store = this.options.store || new MemoryStore()

    let log
    if (this.options.time) {
      log = this.options.time.nextLog({ nodeId: this.nodeId, store })
    } else {
      log = new Log({ nodeId: this.nodeId, store })
    }

    this.logger = console

    this.contexts = new WeakMap()
    this.log = log

    let cleaned = {}

    this.on('preadd', (action, meta) => {
      let isLogux = action.type.slice(0, 6) === 'logux/'
      if (!meta.server) {
        meta.server = this.nodeId
      }
      if (!meta.status && !isLogux) {
        meta.status = 'waiting'
      }
      if (meta.id.split(' ')[1] === this.nodeId) {
        if (!meta.subprotocol) {
          meta.subprotocol = this.options.subprotocol
        }
        if (
          !isLogux &&
          !this.types[action.type] &&
          !this.getRegexProcessor(action.type)
        ) {
          meta.status = 'processed'
        }
      }
      this.replaceResendShortcuts(meta)
    })
    this.on('add', async (action, meta) => {
      let start = Date.now()
      if (meta.reasons.length === 0) {
        cleaned[meta.id] = true
        this.emitter.emit('report', 'addClean', { action, meta })
      } else {
        this.emitter.emit('report', 'add', { action, meta })
      }

      if (this.destroying && !this.actionToQueue.has(meta.id)) {
        return
      }

      if (action.type === 'logux/subscribe') {
        if (meta.server === this.nodeId) {
          this.subscribeAction(action, meta, start)
        }
        return
      }

      if (action.type === 'logux/unsubscribe') {
        if (meta.server === this.nodeId) {
          this.unsubscribeAction(action, meta)
        }
        return
      }

      let processor = this.getProcessor(action.type)
      if (processor && processor.resend && meta.status === 'waiting') {
        let ctx = this.createContext(action, meta)
        let resend
        try {
          resend = await processor.resend(ctx, action, meta)
        } catch (e) {
          this.undo(action, meta, 'error')
          this.emitter.emit('error', e, action, meta)
          this.finally(processor, ctx, action, meta)
          return
        }
        if (resend) {
          if (typeof resend === 'string') {
            resend = { channels: [resend] }
          } else if (Array.isArray(resend)) {
            resend = { channels: resend }
          } else {
            this.replaceResendShortcuts(resend)
          }
          let diff = {}
          for (let i of RESEND_META) {
            if (resend[i]) diff[i] = resend[i]
          }
          await this.log.changeMeta(meta.id, diff)
          meta = { ...meta, ...diff }
        }
      }

      if (this.isUseless(action, meta)) {
        this.emitter.emit('report', 'useless', { action, meta })
      }

      await this.sendAction(action, meta)

      if (meta.status === 'waiting') {
        if (!processor) {
          this.internalUnknownType(action, meta)
          return
        }
        if (processor.process) {
          this.processAction(processor, action, meta, start)
        } else {
          this.emitter.emit('processed', action, meta, 0)
          this.finally(
            processor,
            this.createContext(action, meta),
            action,
            meta
          )
          this.markAsProcessed(meta)
        }
      } else {
        this.emitter.emit('processed', action, meta, 0)
        this.finally(processor, this.createContext(action, meta), action, meta)
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
    this.processing = 0

    this.lastClient = 0

    this.channels = []
    this.subscribers = {}

    this.authAttempts = {}
    this.unknownTypes = {}
    this.wrongChannels = {}

    this.timeouts = {}
    this.lastTimeout = 0

    this.typeToQueue = new Map()
    this.queues = new Map()
    this.actionToQueue = new Map()

    this.httpListeners = {}
    this.httpAllListeners = []
    addHttpPages(this)

    this.listenNotes = {}

    let end = (actionId, queue, queueKey, ...args) => {
      this.actionToQueue.delete(actionId)
      if (queue.length() === 0) {
        this.queues.delete(queueKey)
      }
      queue.next(...args)
    }
    let undoRemainingTasks = queue => {
      let remainingTasks = queue.getQueue()
      if (remainingTasks) {
        for (let task of remainingTasks) {
          this.undo(task.action, task.meta, 'error')
          this.actionToQueue.delete(task.meta.id)
        }
      }
      queue.killAndDrain()
    }
    this.on('error', (e, action, meta) => {
      let queueKey = this.actionToQueue.get(meta?.id)
      if (queueKey) {
        let queue = this.queues.get(queueKey)
        undoRemainingTasks(queue)
        end(meta.id, queue, queueKey, e)
      }
    })
    this.on('processed', (action, meta) => {
      if (action.type === 'logux/undo') {
        let queueKey = this.actionToQueue.get(action.id)
        if (queueKey) {
          let queue = this.queues.get(queueKey)
          undoRemainingTasks(queue)
          end(action.id, queue, queueKey, null, meta)
        }
      } else if (action.type === 'logux/processed') {
        let queueKey = this.actionToQueue.get(action.id)
        if (queueKey) {
          let queue = this.queues.get(queueKey)
          end(action.id, queue, queueKey, null, meta)
        }
      } else if (
        action.type !== 'logux/subscribed' &&
        action.type !== 'logux/unsubscribed'
      ) {
        let queueKey = this.actionToQueue.get(meta.id)
        if (queueKey) {
          let queue = this.queues.get(queueKey)
          end(meta.id, queue, queueKey, null, meta)
        }
      }
    })

    this.unbind.push(() => {
      for (let i of this.connected.values()) i.destroy()
      for (let i in this.timeouts) {
        clearTimeout(this.timeouts[i])
      }
    })
    this.unbind.push(() => {
      return new Promise(resolve => {
        if (this.processing === 0) {
          resolve()
        } else {
          this.on('processed', () => {
            if (this.processing === 0) resolve()
          })
        }
      })
    })
    this.unbind.push(() => {
      return Promise.allSettled(
        [...this.queues.values()].map(queue => {
          return new Promise(resolve => {
            queue.drain = resolve
          })
        })
      )
    })
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

  buildUndo(action, meta, reason, extra) {
    let undoMeta = { status: 'processed' }

    if (meta.users) undoMeta.users = meta.users.slice(0)
    if (meta.nodes) undoMeta.nodes = meta.nodes.slice(0)
    if (meta.clients) undoMeta.clients = meta.clients.slice(0)
    if (meta.reasons) undoMeta.reasons = meta.reasons.slice(0)
    if (meta.channels) undoMeta.channels = meta.channels.slice(0)
    if (meta.excludeClients) {
      undoMeta.excludeClients = meta.excludeClients.slice(0)
    }

    let undoAction = {
      ...extra,
      action,
      id: meta.id,
      reason,
      type: 'logux/undo'
    }
    return [undoAction, undoMeta]
  }

  channel(pattern, callbacks, options = {}) {
    normalizeChannelCallbacks(`Channel ${pattern}`, callbacks)
    let channel = Object.assign({}, callbacks)
    if (typeof pattern === 'string') {
      channel.pattern = new UrlPattern(pattern, {
        segmentValueCharset: '^/'
      })
    } else {
      channel.regexp = pattern
    }

    channel.queueName = options.queue || 'main'
    this.channels.push(channel)
  }

  createContext(action, meta) {
    let context = this.contexts.get(action)
    if (!context) {
      context = new Context(this, meta)
      this.contexts.set(action, context)
    }
    return context
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

  denyAction(action, meta) {
    this.emitter.emit('report', 'denied', { actionId: meta.id })
    this.undo(action, meta, 'denied')
    this.debugActionError(meta, `Action "${meta.id}" was denied`)
  }

  destroy() {
    this.destroying = true
    this.emitter.emit('report', 'destroy')
    return Promise.all(this.unbind.map(i => i()))
  }

  finally(processor, ctx, action, meta) {
    this.contexts.delete(action)
    if (processor && processor.finally) {
      try {
        processor.finally(ctx, action, meta)
      } catch (err) {
        this.emitter.emit('error', err, action, meta)
      }
    }
  }

  getProcessor(type) {
    return (
      this.types[type] || this.getRegexProcessor(type) || this.otherProcessor
    )
  }

  getRegexProcessor(type) {
    for (let regexp of this.regexTypes.keys()) {
      if (type.match(regexp) !== null) {
        return this.regexTypes.get(regexp)
      }
    }
    return undefined
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
      this.httpListeners[`${method} ${url}`] = listener
    }
  }

  internalUnknownType(action, meta) {
    this.contexts.delete(action)
    this.log.changeMeta(meta.id, { status: 'error' })
    this.emitter.emit('report', 'unknownType', {
      actionId: meta.id,
      type: action.type
    })
    if (parseId(meta.id).userId !== 'server') {
      this.undo(action, meta, 'unknownType')
    }
    this.debugActionError(meta, `Action with unknown type ${action.type}`)
  }

  internalWrongChannel(action, meta) {
    this.contexts.delete(action)
    this.emitter.emit('report', 'wrongChannel', {
      actionId: meta.id,
      channel: action.channel
    })
    this.undo(action, meta, 'wrongChannel')
    this.debugActionError(meta, `Wrong channel name ${action.channel}`)
  }

  isBruteforce(ip) {
    let attempts = this.authAttempts[ip]
    return attempts && attempts >= 3
  }

  isUseless(action, meta) {
    if (
      meta.status !== 'processed' ||
      this.types[action.type] ||
      this.getRegexProcessor(action.type)
    ) {
      return false
    }
    for (let i of ['channels', 'nodes', 'clients', 'users']) {
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
      await readFile(
        join(fileURLToPath(import.meta.url), '..', '..', 'package.json')
      )
    )

    this.ws.on('connection', (ws, req) => {
      ws.upgradeReq = req
      this.addClient(new ServerConnection(ws))
    })
    this.emitter.emit('report', 'listen', {
      cert: !!this.options.cert,
      environment: this.env,
      host: this.options.host,
      loguxServer: pkg.version,
      nodeId: this.nodeId,
      notes: this.listenNotes,
      port: this.options.port,
      redis: this.options.redis,
      server: !!this.options.server,
      subprotocol: this.options.subprotocol,
      supports: this.options.supports
    })
  }

  markAsProcessed(meta) {
    this.log.changeMeta(meta.id, { status: 'processed' })
    let data = parseId(meta.id)
    if (data.userId !== 'server') {
      this.log.add(
        { id: meta.id, type: 'logux/processed' },
        { clients: [data.clientId], status: 'processed' }
      )
    }
  }

  on(event, listener) {
    if (event === 'preadd' || event === 'add' || event === 'clean') {
      return this.log.emitter.on(event, listener)
    } else {
      return this.emitter.on(event, listener)
    }
  }

  otherChannel(callbacks) {
    normalizeChannelCallbacks('Unknown channel', callbacks)
    if (this.otherSubscriber) {
      throw new Error('Callbacks for unknown channel are already defined')
    }
    let channel = Object.assign({}, callbacks)
    channel.pattern = {
      match(name) {
        return [name]
      }
    }
    this.otherSubscriber = channel
  }

  otherType(callbacks) {
    if (this.otherProcessor) {
      throw new Error('Callbacks for unknown types are already defined')
    }
    normalizeTypeCallbacks('Unknown type', callbacks)
    this.otherProcessor = callbacks
  }

  performUnsubscribe(clientNodeId, action, meta) {
    if (this.subscribers[action.channel]) {
      let subscriber = this.subscribers[action.channel][clientNodeId]
      if (subscriber) {
        if (subscriber.unsubscribe) {
          subscriber.unsubscribe(action, meta)
          this.contexts.delete(action)
        }
        let filterId = subscriberFilterId(action)
        delete subscriber.filters[filterId]
        if (Object.keys(subscriber.filters).length === 0) {
          delete this.subscribers[action.channel][clientNodeId]
        }
        if (Object.keys(this.subscribers[action.channel]).length === 0) {
          delete this.subscribers[action.channel]
        }
      }
    }
    this.emitter.emit('unsubscribed', action, meta, clientNodeId)
    this.emitter.emit('report', 'unsubscribed', {
      actionId: meta.id,
      channel: action.channel
    })
  }

  process(action, meta = {}) {
    return new Promise((resolve, reject) => {
      let unbindError = this.on('error', (e, errorAction) => {
        if (errorAction === action) {
          unbindError()
          unbindProcessed()
          reject(e)
        }
      })
      let unbindProcessed = this.on('processed', (processed, processedMeta) => {
        if (processed === action) {
          unbindError()
          unbindProcessed()
          resolve(processedMeta)
        }
      })
      this.log.add(action, meta)
    })
  }

  async processAction(processor, action, meta, start) {
    let ctx = this.createContext(action, meta)

    let latency
    this.processing += 1
    try {
      await processor.process(ctx, action, meta)
      latency = Date.now() - start
      this.markAsProcessed(meta)
    } catch (e) {
      this.log.changeMeta(meta.id, { status: 'error' })
      this.undo(action, meta, 'error')
      this.emitter.emit('error', e, action, meta)
    } finally {
      this.finally(processor, ctx, action, meta)
    }
    if (typeof latency === 'undefined') latency = Date.now() - start
    this.processing -= 1
    this.emitter.emit('processed', action, meta, latency)
  }

  async processHttp(req, res) {
    let urlString = req.url
    if (/^\/\w+%3F/.test(urlString)) {
      urlString = decodeURIComponent(urlString)
    }
    let reqUrl = new URL(urlString, 'http://localhost')
    let rule = this.httpListeners[req.method + ' ' + reqUrl.pathname]

    if (!rule) {
      let processed = false
      for (let listener of this.httpAllListeners) {
        let result = await listener(req, res)
        if (result === true) {
          processed = true
          break
        }
      }
      if (!processed) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
      }
    } else {
      await rule(req, res)
    }
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

  replaceResendShortcuts(meta) {
    if (meta.channel) {
      meta.channels = [meta.channel]
      delete meta.channel
    }
    if (meta.user) {
      meta.users = [meta.user]
      delete meta.user
    }
    if (meta.client) {
      meta.clients = [meta.client]
      delete meta.client
    }
    if (meta.node) {
      meta.nodes = [meta.node]
      delete meta.node
    }
  }

  async sendAction(action, meta) {
    let from = parseId(meta.id).clientId
    let ignoreClients = new Set(meta.excludeClients || [])
    ignoreClients.add(from)

    if (meta.nodes) {
      for (let id of meta.nodes) {
        let client = this.nodeIds.get(id)
        if (client) {
          ignoreClients.add(client.clientId)
          client.node.onAdd(action, meta)
        }
      }
    }

    if (meta.clients) {
      for (let id of meta.clients) {
        if (this.clientIds.has(id)) {
          let client = this.clientIds.get(id)
          ignoreClients.add(client.clientId)
          client.node.onAdd(action, meta)
        }
      }
    }

    if (meta.users) {
      for (let userId of meta.users) {
        let users = this.userIds.get(userId)
        if (users) {
          for (let client of users) {
            if (!ignoreClients.has(client.clientId)) {
              ignoreClients.add(client.clientId)
              client.node.onAdd(action, meta)
            }
          }
        }
      }
    }

    if (meta.channels) {
      for (let channel of meta.channels) {
        if (this.subscribers[channel]) {
          for (let nodeId in this.subscribers[channel]) {
            let clientId = parseId(nodeId).clientId
            if (!ignoreClients.has(clientId)) {
              let subscriber = this.subscribers[channel][nodeId]
              if (subscriber) {
                let ctx = this.createContext(action, meta)
                let client = this.clientIds.get(clientId)
                for (let filter of Object.values(subscriber.filters)) {
                  filter =
                    typeof filter === 'function'
                      ? await filter(ctx, action, meta)
                      : filter
                  if (filter && client) {
                    ignoreClients.add(clientId)
                    client.node.onAdd(action, meta)
                  }
                }
              }
            }
          }
        }
      }
    }
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

  subscribe(nodeId, channel) {
    if (!this.subscribers[channel] || !this.subscribers[channel][nodeId]) {
      if (!this.subscribers[channel]) {
        this.subscribers[channel] = {}
      }
      this.subscribers[channel][nodeId] = { filters: { '{}': true } }
      this.log.add({ channel, type: 'logux/subscribed' }, { nodes: [nodeId] })
    }
  }

  async subscribeAction(action, meta, start) {
    if (typeof action.channel !== 'string') {
      this.wrongChannel(action, meta)
      return
    }

    let channels = this.channels
    if (this.otherSubscriber) {
      channels = this.channels.concat([this.otherSubscriber])
    }

    let match
    for (let channel of channels) {
      if (channel.pattern) {
        match = channel.pattern.match(action.channel)
      } else {
        match = action.channel.match(channel.regexp)
      }

      let subscribed = false
      if (match) {
        let ctx = this.createContext(action, meta)
        ctx.params = match
        try {
          let access = await channel.access(ctx, action, meta)
          if (this.wrongChannels[meta.id]) {
            delete this.wrongChannels[meta.id]
            return
          }
          if (!access) {
            this.denyAction(action, meta)
            return
          }

          let client = this.clientIds.get(ctx.clientId)
          if (!client) {
            this.emitter.emit('subscriptionCancelled')
            return
          }

          let filterId = subscriberFilterId(action)
          let filters = { [filterId]: true }

          if (channel.filter) {
            let filter = await channel.filter(ctx, action, meta)
            filters = { [filterId]: filter }
          }

          this.emitter.emit('report', 'subscribed', {
            actionId: meta.id,
            channel: action.channel
          })

          if (!this.subscribers[action.channel]) {
            this.subscribers[action.channel] = {}
            this.emitter.emit('subscribing', action, meta)
          }
          let subscriber = this.subscribers[action.channel][ctx.nodeId]
          if (subscriber) {
            filters = { ...subscriber.filters, ...filters }
          }
          this.subscribers[action.channel][ctx.nodeId] = {
            filters,
            unsubscribe: channel.unsubscribe
              ? (unsubscribeAction, unsubscribeMeta) =>
                  channel.unsubscribe(ctx, unsubscribeAction, unsubscribeMeta)
              : undefined
          }
          subscribed = true

          if (channel.load) {
            let sendBack = await channel.load(ctx, action, meta)
            if (Array.isArray(sendBack)) {
              await Promise.all(
                sendBack.map(i => {
                  return Array.isArray(i) ? ctx.sendBack(...i) : ctx.sendBack(i)
                })
              )
            } else if (sendBack) {
              await ctx.sendBack(sendBack)
            }
          }
          this.emitter.emit('subscribed', action, meta, Date.now() - start)
          this.markAsProcessed(meta)
        } catch (e) {
          if (e.name === 'LoguxNotFoundError') {
            this.undo(action, meta, 'notFound')
          } else {
            this.emitter.emit('error', e, action, meta)
            this.undo(action, meta, 'error')
          }
          if (subscribed) {
            this.unsubscribe(action, meta)
          }
        } finally {
          this.finally(channel, ctx, action, meta)
        }
        break
      }
    }

    if (!match) this.wrongChannel(action, meta)
  }

  type(name, callbacks, options = {}) {
    let queue = options.queue || 'main'
    this.typeToQueue.set(name, queue)

    if (typeof name === 'function') name = name.type
    normalizeTypeCallbacks(`Action type ${name}`, callbacks)

    if (name instanceof RegExp) {
      this.regexTypes.set(name, callbacks)
    } else {
      if (this.types[name]) {
        throw new Error(`Action type ${name} was already defined`)
      }
      this.types[name] = callbacks
    }
  }

  undo(action, meta, reason = 'error', extra = {}) {
    let clientId = parseId(meta.id).clientId
    let [undoAction, undoMeta] = this.buildUndo(action, meta, reason, extra)
    undoMeta.clients = (undoMeta.clients || []).concat([clientId])
    return this.log.add(undoAction, undoMeta)
  }

  unknownType(action, meta) {
    this.internalUnknownType(action, meta)
    this.unknownTypes[meta.id] = true
  }

  unsubscribe(action, meta) {
    let clientNodeId = meta.id.split(' ')[1]
    this.performUnsubscribe(clientNodeId, action, meta)
  }

  unsubscribeAction(action, meta) {
    if (typeof action.channel !== 'string') {
      this.wrongChannel(action, meta)
      return
    }

    this.unsubscribe(action, meta)

    this.markAsProcessed(meta)
    this.contexts.delete(action)
  }

  wrongChannel(action, meta) {
    this.internalWrongChannel(action, meta)
    this.wrongChannels[meta.id] = true
  }
}
