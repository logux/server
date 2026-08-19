import { parseId } from '@logux/core'

export class Context {
  constructor(server, meta) {
    this.server = server
    this.data = {}

    let client
    if (meta.node) {
      client = meta
      this.nodeId = client.nodeId
      this.userId = client.userId
      this.clientId = client.clientId
      this.subprotocol = client.node.remoteSubprotocol
    } else {
      let parsed = parseId(meta.id)
      this.nodeId = parsed.nodeId
      this.userId = parsed.userId
      this.clientId = parsed.clientId
      this.isServer = this.userId === 'server'
      client = server.clientIds.get(this.clientId)
      if (meta.subprotocol) {
        this.subprotocol = meta.subprotocol
      } else if (client) {
        this.subprotocol = client.node.remoteSubprotocol
      }
    }

    if (client) {
      this.headers = client.node.remoteHeaders
    } else {
      this.headers = {}
    }
  }

  drain() {
    return this.server.drain(this.clientId)
  }

  sendBack(actions, meta = {}) {
    let common = { clients: [this.clientId], status: 'processed', ...meta }
    if (Array.isArray(actions)) {
      return this.server.log.add(
        actions.map(item => {
          // Every action can have own meta as `[action, meta]`
          return Array.isArray(item)
            ? [item[0], { ...common, ...item[1] }]
            : [item, { ...common }]
        })
      )
    }
    return this.server.log.add(actions, common)
  }
}
