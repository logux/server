import { parseId } from '@logux/core'

import { Context } from '../context/index.js'

function addTarget(targets, client, action, meta) {
  let entries = targets.get(client)
  if (entries) {
    entries.push([action, meta])
  } else {
    targets.set(client, [[action, meta]])
  }
}

function maxAdded(settled, meta) {
  if (typeof meta.added === 'undefined' || meta.added < settled) return settled
  return meta.added
}

/**
 * Delivers the actions of the log to the clients.
 *
 * The publisher never runs `access`, `resend` or `process`: it resolves
 * the recipients of the already stored facts and tracks the sending.
 */
export class Publisher {
  constructor(server) {
    this.server = server
    this.pending = new Set()
  }

  #resolveTargets(action, meta, targets) {
    let from = parseId(meta.id).clientId
    let ignoreClients = new Set(meta.excludeClients || [])
    ignoreClients.add(from)

    if (meta.nodes) {
      for (let id of meta.nodes) {
        let client = this.server.nodeIds.get(id)
        if (client) {
          ignoreClients.add(client.clientId)
          addTarget(targets, client, action, meta)
        }
      }
    }

    if (meta.clients) {
      for (let id of meta.clients) {
        if (this.server.clientIds.has(id)) {
          let client = this.server.clientIds.get(id)
          ignoreClients.add(client.clientId)
          addTarget(targets, client, action, meta)
        }
      }
    }

    if (meta.users) {
      for (let userId of meta.users) {
        let users = this.server.userIds.get(userId)
        if (users) {
          for (let client of users) {
            if (!ignoreClients.has(client.clientId)) {
              ignoreClients.add(client.clientId)
              addTarget(targets, client, action, meta)
            }
          }
        }
      }
    }

    if (!meta.channels) return undefined

    let waiting = []
    for (let channel of meta.channels) {
      if (this.server.subscribers[channel]) {
        for (let nodeId in this.server.subscribers[channel]) {
          let clientId = parseId(nodeId).clientId
          if (!ignoreClients.has(clientId)) {
            let subscriber = this.server.subscribers[channel][nodeId]
            if (subscriber) {
              let ctx = new Context(this.server, meta)
              let client = this.server.clientIds.get(clientId)
              for (let filter of Object.values(subscriber.filters)) {
                if (typeof filter === 'function') {
                  waiting.push(
                    Promise.resolve(filter(ctx, action, meta)).then(
                      result => {
                        if (result && client && !ignoreClients.has(clientId)) {
                          ignoreClients.add(clientId)
                          addTarget(targets, client, action, meta)
                        }
                      },
                      e => {
                        // A broken filter is a delivery problem, not a reason
                        // to undo the already processed action
                        this.server.emitter.emit('error', e, action, meta)
                      }
                    )
                  )
                } else if (filter && client) {
                  ignoreClients.add(clientId)
                  addTarget(targets, client, action, meta)
                }
              }
            }
          }
        }
      }
    }
    return waiting.length > 0 ? Promise.all(waiting) : undefined
  }

  async send(entries) {
    let targets = new Map()
    let waiting = []
    let settled = 0
    for (let [action, meta] of entries) {
      settled = maxAdded(settled, meta)
      let promise = this.#resolveTargets(action, meta, targets)
      if (promise) waiting.push(promise)
    }
    if (waiting.length > 0) await Promise.all(waiting)
    this.#sendTargets(targets, settled)
  }

  // A barrier for the queue and the shutdown: it never rejects,
  // the failures are reported where the sending was started
  async settled() {
    while (this.pending.size > 0) await Promise.all(this.pending)
  }

  // Returns the original promise, so the rejection is not swallowed
  track(entries) {
    let sending = this.send(entries)
    let done = sending.then(
      () => this.pending.delete(done),
      () => this.pending.delete(done)
    )
    this.pending.add(done)
    return sending
  }

  #sendTargets(targets, settled) {
    for (let [client, entries] of targets) {
      let sending = client.node.onAdd(entries)
      // Only `ServerClient` tracks sending for `Server#drain()`
      if (client.track) client.track(sending)
    }
    if (settled > 0) {
      for (let client of this.server.connected.values()) {
        if (!targets.has(client) && client.node.lastAddedCache < settled) {
          client.node.lastAddedCache = settled
        }
      }
    }
    targets.clear()
  }
}
