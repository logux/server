import { ServerNode } from '@logux/core'

function has(array, item) {
  return array && array.includes(item)
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
}
