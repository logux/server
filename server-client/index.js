import { LoguxError, parseId } from '@logux/core'
import { parseCookie } from 'cookie'

import { ALLOWED_META } from '../allowed-meta/index.js'
import { filterMeta } from '../filter-meta/index.js'
import { FilteredNode } from '../filtered-node/index.js'
import { removeMembership } from '../processing/index.js'

async function onSend(action, meta) {
  return [action, filterMeta(meta)]
}

function ignore() {}

function reportDetails(client) {
  return {
    connectionId: client.key,
    nodeId: client.nodeId,
    subprotocol: client.node.remoteSubprotocol
  }
}

export class ServerClient {
  constructor(app, connection, key) {
    this.app = app
    this.userId = undefined
    this.clientId = undefined
    this.nodeId = undefined
    this.data = {}
    this.sending = new Set()
    this.connection = connection
    this.key = key.toString()
    if (connection.ws) {
      this.remoteAddress = connection.ws._socket.remoteAddress
      this.httpHeaders = connection.ws.upgradeReq.headers
    } else {
      this.remoteAddress = '127.0.0.1'
      this.httpHeaders = {}
    }

    let Node = app.options.Node || FilteredNode

    this.node = new Node(this, app.nodeId, app.log, connection, {
      auth: this.auth.bind(this),
      onReceive: this.onReceive.bind(this),
      onSend,
      ping: app.options.ping,
      ready: () => this.waitForReady(),
      subprotocol: app.options.subprotocol,
      syncBatch: app.options.syncBatch,
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

    if (this.app.options.minSubprotocol) {
      if (this.node.remoteSubprotocol < this.app.options.minSubprotocol) {
        throw new LoguxError('wrong-subprotocol', {
          supported: this.app.options.minSubprotocol,
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
        cookie: parseCookie(headers.cookie || ''),
        headers: this.node.remoteHeaders,
        token,
        userId: this.userId
      })
    } catch (e) {
      if (e.name === 'LoguxError') {
        /* c8 ignore next 1 */
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
    this.app.runner.cleanConnection(this)
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
          removeMembership(this.app, this.nodeId, action, meta)
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

  async drain() {
    if (this.sending.size > 0) await Promise.all(this.sending)
    if (this.destroyed || !this.node.connected) return false
    if (this.node.syncing === 0) return true
    return new Promise(resolve => {
      let unbind = this.node.on('state', () => {
        if (this.node.state === 'synchronized') {
          unbind()
          resolve(true)
        } else if (!this.node.connected) {
          unbind()
          resolve(false)
        }
      })
    })
  }

  onReceive(action, meta) {
    let actionClientId = parseId(meta.id).clientId
    let wrongUser = !this.clientId || this.clientId !== actionClientId
    let wrongMeta = Object.keys(meta).some(i => !ALLOWED_META.includes(i))
    if (wrongUser || wrongMeta) {
      this.app.reportFailure('denied', action, meta)
      void this.app.publishUndo(action, meta, 'denied', {}, this.clientId)
      return Promise.resolve(false)
    }

    if (!meta.subprotocol) {
      meta.subprotocol = this.node.remoteSubprotocol
    }

    return this.app.runner.submit({ action, client: this, meta }).then(
      () => false,
      err => {
        if (err.transportFailure) throw err
        return false
      }
    )
  }

  track(sending) {
    let done = Promise.resolve(sending).then(ignore, ignore)
    this.sending.add(done)
    void done.then(() => {
      this.sending.delete(done)
    })
  }

  async waitForReady() {
    if (!this.node.remoteReady) {
      await new Promise(resolve => {
        this.node.on('ready', resolve)
      })
    }
    await this.app.runner.waitForClient(this)
    await this.drain()
  }
}
