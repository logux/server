import { parseId } from '@logux/core'
import semver from 'semver'

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

  isSubprotocol(range) {
    return semver.satisfies(this.subprotocol, range)
  }

  sendBack(action, meta = {}) {
    return this.server.log.add(action, {
      clients: [this.clientId],
      status: 'processed',
      ...meta
    })
  }
}
