import { LoguxError, parseId } from '@logux/core'
import cookie from 'cookie'
import fastq from 'fastq'
import semver from 'semver'

import { ALLOWED_META } from '../allowed-meta/index.js'
import { filterMeta } from '../filter-meta/index.js'
import { FilteredNode } from '../filtered-node/index.js'

async function onSend(action, meta) {
  return [action, filterMeta(meta)]
}

function reportDetails(client) {
  return {
    connectionId: client.key,
    nodeId: client.nodeId,
    subprotocol: client.node.remoteSubprotocol
  }
}

function denyBack(app, clientId, action, meta) {
  app.emitter.emit('report', 'denied', { actionId: meta.id })
  let [undoAction, undoMeta] = app.buildUndo(action, meta, 'denied')
  undoMeta.clients = (undoMeta.clients || []).concat([clientId])
  app.log.add(undoAction, undoMeta)
  app.debugActionError(meta, `Action "${meta.id}" was denied`)
}

async function queueWorker(task, next) {
  let { action, app, clientId, meta, onReceiveResolve, queue } = task
  queue.next = next

  let type = action.type
  if (type === 'logux/subscribe' || type === 'logux/unsubscribe') {
    return onReceiveResolve([action, meta])
  }

  let processor = app.getProcessor(type)
  if (!processor) {
    app.internalUnknownType(action, meta)
    return onReceiveResolve(false)
  }

  let ctx = app.createContext(action, meta)
  try {
    let result = await processor.access(ctx, action, meta)
    if (app.unknownTypes[meta.id]) {
      delete app.unknownTypes[meta.id]
      app.finally(processor, ctx, action, meta)
      return false
    } else if (!result) {
      app.finally(processor, ctx, action, meta)
      denyBack(app, clientId, action, meta)
      return onReceiveResolve(false)
    } else {
      return onReceiveResolve([action, meta])
    }
  } catch (e) {
    app.undo(action, meta, 'error')
    app.emitter.emit('error', e, action, meta)
    app.finally(processor, ctx, action, meta)
    return onReceiveResolve(false)
  }
}

export class ServerClient {
  constructor(app, connection, key) {
    this.app = app
    this.userId = undefined
    this.clientId = undefined
    this.nodeId = undefined
    this.processing = false
    this.connection = connection
    this.key = key.toString()
    if (connection.ws) {
      this.remoteAddress = connection.ws._socket.remoteAddress
      this.httpHeaders = connection.ws.upgradeReq.headers
    } else {
      this.remoteAddress = '127.0.0.1'
      this.httpHeaders = {}
    }

    this.node = new FilteredNode(this, app.nodeId, app.log, connection, {
      auth: this.auth.bind(this),
      onReceive: this.onReceive.bind(this),
      onSend,
      ping: app.options.ping,
      subprotocol: app.options.subprotocol,
      timeout: app.options.timeout
    })
    if (this.app.env === 'development') {
      this.node.setLocalHeaders({ env: 'development' })
    }

    this.node.catch(err => {
      err.connectionId = this.key
      this.app.emitter.emit('error', err)
    })
    this.node.on('state', () => {
      if (!this.node.connected && !this.destroyed) this.destroy()
    })
    this.node.on('clientError', err => {
      if (err.type !== 'wrong-credentials') {
        err.connectionId = this.key
        this.app.emitter.emit('clientError', err)
      }
    })

    this.app.emitter.emit('connected', this)
  }

  async auth(nodeId, token) {
    this.nodeId = nodeId
    let { clientId, userId } = parseId(nodeId)
    this.clientId = clientId
    this.userId = userId

    if (this.app.options.supports) {
      if (!this.isSubprotocol(this.app.options.supports)) {
        throw new LoguxError('wrong-subprotocol', {
          supported: this.app.options.supports,
          used: this.node.remoteSubprotocol
        })
      }
    }

    if (nodeId === 'server' || userId === 'server') {
      this.app.emitter.emit('unauthenticated', this, 0)
      this.app.emitter.emit('report', 'unauthenticated', reportDetails(this))
      return false
    }

    let ws = this.connection.ws
    let headers = {}
    if (ws && ws.upgradeReq && ws.upgradeReq.headers) {
      headers = ws.upgradeReq.headers
    }

    let start = Date.now()
    let result
    try {
      result = await this.app.authenticator({
        client: this,
        cookie: cookie.parse(headers.cookie || ''),
        headers: this.node.remoteHeaders,
        token,
        userId: this.userId
      })
    } catch (e) {
      if (e.name === 'LoguxError') {
        throw e
      } else {
        e.nodeId = nodeId
        this.app.emitter.emit('error', e)
        result = false
      }
    }

    if (this.app.isBruteforce(this.remoteAddress)) {
      let e = new LoguxError('bruteforce')
      e.nodeId = nodeId
      this.app.emitter.emit('clientError', e)
      result = false
    }

    if (result) {
      let zombie = this.app.clientIds.get(this.clientId)
      if (zombie) {
        zombie.zombie = true
        this.app.emitter.emit('report', 'zombie', { nodeId: zombie.nodeId })
        zombie.destroy()
      }
      this.app.clientIds.set(this.clientId, this)
      this.app.nodeIds.set(this.nodeId, this)
      if (this.userId) {
        if (!this.app.userIds.has(this.userId)) {
          this.app.userIds.set(this.userId, [this])
        } else {
          this.app.userIds.get(this.userId).push(this)
        }
      }
      this.app.emitter.emit('authenticated', this, Date.now() - start)
      this.app.emitter.emit('report', 'authenticated', reportDetails(this))
    } else {
      this.app.emitter.emit('unauthenticated', this, Date.now() - start)
      this.app.emitter.emit('report', 'unauthenticated', reportDetails(this))
      this.app.rememberBadAuth(this.remoteAddress)
    }
    return result
  }

  destroy() {
    this.destroyed = true
    this.node.destroy()
    if (this.userId) {
      let users = this.app.userIds.get(this.userId)
      if (users) {
        users = users.filter(i => i !== this)
        if (users.length === 0) {
          this.app.userIds.delete(this.userId)
        } else {
          this.app.userIds.set(this.userId, users)
        }
      }
    }
    if (this.clientId) {
      for (let channel in this.app.subscribers) {
        let subscriber = this.app.subscribers[channel][this.nodeId]
        if (subscriber) {
          let action = { channel, type: 'logux/unsubscribe' }
          let actionId = this.app.log.generateId()
          let meta = { id: actionId, reasons: [], time: parseInt(actionId) }
          this.app.performUnsubscribe(this.nodeId, action, meta)
        }
      }
      this.app.clientIds.delete(this.clientId)
      this.app.nodeIds.delete(this.nodeId)
    }
    if (!this.app.destroying) {
      this.app.emitter.emit('disconnected', this)
    }
    this.app.connected.delete(this.key)
  }

  isSubprotocol(range) {
    return semver.satisfies(this.node.remoteSubprotocol, range)
  }

  onReceive(action, meta) {
    if (this.app.actionToQueue.has(meta.id)) {
      return Promise.resolve(false)
    }

    let actionClientId = parseId(meta.id).clientId
    let wrongUser = !this.clientId || this.clientId !== actionClientId
    let wrongMeta = Object.keys(meta).some(i => !ALLOWED_META.includes(i))
    if (wrongUser || wrongMeta) {
      denyBack(this.app, this.clientId, action, meta)
      return Promise.resolve(false)
    }

    return new Promise(resolve => {
      let clientId = parseId(meta.id).clientId
      let queueName = ''

      let isChannel =
        (action.type === 'logux/subscribe' ||
          action.type === 'logux/unsubscribe') &&
        action.channel

      if (isChannel) {
        for (let channel of this.app.channels) {
          let pattern = channel.regexp || channel.pattern.regex
          if (action.channel.match(pattern)) {
            queueName = channel.queue
            break
          }
        }
      } else {
        queueName = this.app.typeToQueue.get(action.type)
      }

      queueName = queueName || 'main'
      let queueKey = `${clientId}/${queueName}`
      let queue = this.app.queues.get(queueKey)

      if (!queue) {
        queue = fastq(queueWorker, 1)
        this.app.queues.set(queueKey, queue)
      }

      if (!meta.subprotocol) {
        meta.subprotocol = this.node.remoteSubprotocol
      }

      this.app.actionToQueue.set(meta.id, queueKey)
      queue.push({
        action,
        app: this.app,
        clientId,
        meta,
        onReceiveResolve: result => {
          resolve(result)
        },
        queue
      })
    })
  }
}
