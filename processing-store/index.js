const DEFAULT_LIMIT = 1000

export class ProcessingStore {
  constructor(limit = DEFAULT_LIMIT) {
    this.entries = new Map()
    this.limit = limit
  }

  delete(key) {
    this.entries.delete(key)
  }

  // A running task must stay: forgetting it allows a second execution
  #evict() {
    for (let [key, entry] of this.entries) {
      if (!entry.task) {
        this.entries.delete(key)
        return
      }
    }
  }

  finish(key, outcome, connection) {
    this.entries.delete(key)
    if (this.entries.size >= this.limit) this.#evict()
    this.entries.set(key, { connection, outcome })
  }

  get(key) {
    return this.entries.get(key)
  }

  // A reconnect must run the handler again instead of replaying
  // the answer of the old connection
  removeConnection(connection) {
    for (let [key, entry] of this.entries) {
      if (entry.connection === connection) this.entries.delete(key)
    }
  }

  start(key, task) {
    this.entries.set(key, { task })
  }
}
