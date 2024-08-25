import { ClientNode, TestPair } from '@logux/core'
import cookie from 'cookie'
import { setTimeout } from 'node:timers/promises'

import { filterMeta } from '../filter-meta/index.js'

export class TestClient {
  constructor(server, userId, opts = {}) {
    this.server = server
    this.pair = new TestPair()
    let clientId = server.testUsers[userId] || 0
    clientId += 1
    server.testUsers[userId] = clientId
    this.userId = userId
    this.clientId = `${userId}:${clientId}`
    this.nodeId = `${this.clientId}:1`
    this.log = server.options.time.nextLog({ nodeId: this.nodeId })
    this.node = new ClientNode(this.nodeId, this.log, this.pair.left, {
      ...opts,
      fixTime: false,
      onSend(action, meta) {
        return [action, filterMeta(meta)]
      }
    })
    this.pair.right.ws = {
      _socket: {
        remoteAddress: '127.0.0.1'
      },
      upgradeReq: {
        headers: opts.httpHeaders || {}
      }
    }
    if (opts.headers) {
      this.node.setLocalHeaders(opts.headers)
    }
    if (opts.cookie) {
      this.pair.right.ws.upgradeReq.headers.cookie = Object.keys(opts.cookie)
        .map(i => cookie.serialize(i, opts.cookie[i]))
        .join('; ')
    }
    server.unbind.push(() => {
      this.node.destroy()
    })
  }

  async collect(test) {
    let added = []
    let unbind = this.node.log.on('add', (action, meta) => {
      if (!meta.id.includes(` ${this.nodeId} `)) {
        added.push(action)
      }
    })
    await test()
    unbind()
    return added
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.node.throwsError = false
      let unbind = this.node.on('error', e => {
        if (e.name === 'LoguxError' && e.type === 'wrong-credentials') {
          reject(new Error('Wrong credentials'))
        } else {
          reject(e)
        }
      })

      this.server.addClient(this.pair.right)
      this.node.connection.connect()
      this.node.waitFor('synchronized').then(() => {
        this.node.throwsError = true
        unbind()
        resolve()
      })
    })
  }

  disconnect() {
    this.node.connection.disconnect()
    return this.pair.wait('right')
  }

  process(action, meta) {
    return this.collect(async () => {
      return new Promise((resolve, reject) => {
        let id
        let lastError
        let unbindError = this.server.on('error', e => {
          lastError = e
        })
        let unbindProcessed = this.log.type('logux/processed', other => {
          if (other.id === id) {
            unbindProcessed()
            unbindUndo()
            unbindError()
            resolve()
          }
        })
        let unbindUndo = this.log.type('logux/undo', other => {
          if (other.id === id) {
            unbindProcessed()
            unbindUndo()
            unbindError()
            let error
            if (other.reason === 'denied') {
              error = new Error('Action was denied')
            } else if (other.reason === 'unknownType') {
              error = new Error(
                `Server does not have callbacks for ${action.type} actions`
              )
            } else if (other.reason === 'wrongChannel') {
              error = new Error(
                `Server does not have callbacks for ${action.channel} channel`
              )
            } else if (lastError) {
              error = lastError
            } else {
              error = new Error('Server undid action')
            }
            error.action = other
            reject(error)
          }
        })
        this.log.add(action, meta).then(newMeta => {
          if (newMeta) {
            id = newMeta.id
          } else {
            reject(new Error(`Action ${meta.id} was already in log`))
          }
        })
      })
    })
  }

  async received(test) {
    let actions = []
    let unbind = this.log.on('add', (action, meta) => {
      if (!meta.id.includes(` ${this.nodeId} `)) {
        actions.push(action)
      }
    })
    await test()
    await setTimeout(1)
    unbind()
    return actions
  }

  async subscribe(channel, filter, since) {
    let action = channel
    if (typeof channel === 'string') {
      action = { channel, type: 'logux/subscribe' }
    }
    if (filter) {
      action.filter = filter
    }
    if (since) {
      action.since = since
    }
    let actions = await this.process(action)
    return actions.filter(i => i.type !== 'logux/processed')
  }

  unsubscribe(channel, filter) {
    let action = channel
    if (typeof channel === 'string') {
      action = { channel, type: 'logux/unsubscribe' }
    }
    if (filter) {
      action.filter = filter
    }
    return this.process(action)
  }
}
