'use strict'

const ServerSync = require('logux-sync/server-sync')

class FilteredSync extends ServerSync {
  constructor (client, nodeId, log, connection, options) {
    super(nodeId, log, connection, options)
    this.client = client

    // Remove add event listener
    this.unbind[0]()
    this.unbind.splice(0, 1)
  }

  syncSinceQuery (lastSynced) {
    const data = []
    return this.log.each({ order: 'added' }, (action, meta) => {
      if (meta.added <= lastSynced) {
        return false
      } else {
        if (meta.nodes && meta.nodes.indexOf(this.client.nodeId) !== -1) {
          data.push(action, meta)
        }
        return true
      }
    }).then(() => data)
  }
}

module.exports = FilteredSync
