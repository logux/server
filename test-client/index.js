let { ClientNode, TestPair } = require('@logux/core')

let filterMeta = require('../filter-meta')

class TestClient {
  constructor (server, userId, opts = { }) {
    this.server = server
    this.pair = new TestPair()
    let clientId = server.testUsers[userId] || 0
    clientId += 1
    server.testUsers[userId] = clientId
    this.nodeId = `${ userId }:${ clientId }:1`
    this.log = server.time.nextLog({ nodeId: this.nodeId })
    this.log.on('preadd', (action, meta) => {
      meta.reasons.push('test')
    })
    this.node = new ClientNode(this.nodeId, this.log, this.pair.left, {
      ...opts,
      fixTime: false,
      outMap: (action, meta) => {
        return [action, filterMeta(meta)]
      }
    })
    server.unbind.push(() => {
      this.node.destroy()
    })
  }

  async connect (opts = { }) {
    this.node.options.token = opts.token
    this.server.addClient(this.pair.right)
    this.node.connection.connect()
    await this.node.waitFor('synchronized')
  }

  disconnect () {
    this.node.connection.disconnect()
    return this.pair.wait('right')
  }

  async collect (test) {
    let added = []
    let unbind = this.node.log.on('add', (action, meta) => {
      if (!meta.id.includes(` ${ this.nodeId } `)) {
        added.push(action)
      }
    })
    await test()
    unbind()
    return added
  }

  process (action, meta) {
    return this.collect(async () => {
      return new Promise((resolve, reject) => {
        let id
        let lastError
        let unbindError = this.server.on('error', e => {
          lastError = e
        })
        let unbindAdd = this.log.on('add', other => {
          if (other.type === 'logux/processed' && other.id === id) {
            unbindAdd()
            unbindError()
            resolve()
          } else if (other.type === 'logux/undo' && other.id === id) {
            unbindAdd()
            unbindError()
            let error
            if (other.reason === 'denied') {
              error = new Error('Action was denied')
            } else if (other.reason === 'unknownType') {
              error = new Error(
                `Server does not have callbacks for ${ action.type } actions`
              )
            } else if (other.reason === 'wrongChannel') {
              error = new Error(
                `Server does not have callbacks for ${ action.channel } channel`
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
            reject(new Error(`Action ${ meta.id } was already in log`))
          }
        })
      })
    })
  }

  async subscribe (channel) {
    let action = channel
    if (typeof channel === 'string') {
      action = { type: 'logux/subscribe', channel }
    }
    let actions = await this.process(action)
    return actions.filter(i => i.type !== 'logux/processed')
  }

  unsubscribe (channel) {
    let action = channel
    if (typeof channel === 'string') {
      action = { type: 'logux/unsubscribe', channel }
    }
    return this.process(action)
  }
}

module.exports = TestClient
