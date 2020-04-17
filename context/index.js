let semver = require('semver')

class Context {
  constructor (nodeId, clientId, userId, subprotocol, server) {
    this.data = { }
    this.nodeId = nodeId
    this.userId = userId
    this.clientId = clientId
    this.isServer = userId === 'server'
    this.subprotocol = subprotocol
    this.server = server
  }

  isSubprotocol (range) {
    return semver.satisfies(this.subprotocol, range)
  }

  sendBack (action, meta = { }) {
    return this.server.process(action, { clients: [this.clientId], ...meta })
  }
}

module.exports = Context
