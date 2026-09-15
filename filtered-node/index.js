import { idToTime, ServerNode } from '@logux/core'

import { Context } from '../context/index.js'
import { filterMeta } from '../filter-meta/index.js'

function has(array, item) {
  return array && array.includes(item)
}

async function loadOnConnect(app, client, lastSynced) {
  let entries = await app.connectLoader(new Context(app, client), lastSynced)
  let added = 0
  for (let entry of entries) {
    // `added` should be taken before `filterMeta()` removes it
    let entryAdded = entry[1].added
    if (entryAdded > added) added = entryAdded
    entry[1] = filterMeta(entry[1])
    // The core needs `added` to set the sync position of every message
    // and removes it before sending the action to the client
    if (typeof entryAdded !== 'undefined') entry[1].added = entryAdded
  }
  return { added, entries }
}

export class FilteredNode extends ServerNode {
  constructor(client, nodeId, log, connection, options) {
    super(nodeId, log, connection, options)
    this.client = client

    // Remove add event listener
    this.unbind[0]()
    this.unbind.splice(0, 1)

    delete this.received
  }

  syncFilter(action, meta) {
    return (
      (has(meta.clients, this.client.clientId) ||
        has(meta.nodes, this.client.nodeId) ||
        has(meta.users, this.client.userId)) &&
      !has(meta.excludeClients, this.client.clientId)
    )
  }

  async syncSinceQuery(lastSynced) {
    let app = this.client.app
    let data = app.connectLoader
      ? await loadOnConnect(app, this.client, lastSynced)
      : await super.syncSinceQuery(lastSynced)

    let actions = data.entries.length
    if (actions > 0) {
      let id = app.log.generateId()
      // Entries are ordered from the newest to the oldest one,
      // so the last entry will be sent to the client first
      data.entries.push([
        { actions, type: 'logux/prepare' },
        { id, time: idToTime(id) }
      ])
    }
    return data
  }
}
