const ServerNode = require('logux-core/server-node')

class FilteredNode extends ServerNode {
  constructor (client, nodeId, log, connection, options) {
    super(nodeId, log, connection, options)
    this.client = client

    // Remove add event listener
    this.unbind[0]()
    this.unbind.splice(0, 1)
  }

  syncSinceQuery (lastSynced) {
    const data = { added: 0, entries: [] }
    return this.log.each({ order: 'added' }, (action, meta) => {
      if (meta.added <= lastSynced) {
        return false
      } else {
        let passed = false
        if (meta.nodeIds && meta.nodeIds.indexOf(this.client.nodeId) !== -1) {
          passed = true
        }
        if (meta.users && meta.users.indexOf(this.client.userId) !== -1) {
          passed = true
        }
        if (passed) {
          if (meta.added > data.added) data.added = meta.added
          data.entries.push([action, meta])
          return true
        }
        return true
      }
    }).then(() => data)
  }
}

module.exports = FilteredNode
