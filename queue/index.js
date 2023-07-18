export class Queue {
  constructor(app, clientId, key) {
    this.app = app
    this.clientId = clientId
    this.data = []
    this.processing = false
    this.key = key
    this.toFilter = new Map()
  }

  add(action, meta) {
    this.data.push(action, meta)
    let filtered
    let filter = new Promise(resolve => {
      filtered = resolve
    })
    this.toFilter.set(meta.id, filtered)
    if (!this.processing) {
      this.processing = true
      this.filterAction(this.data[0], this.data[1])
    }
    return filter
  }

  async filterAction(action, meta) {
    let type = action.type
    let filtered = this.toFilter.get(meta.id)
    if (type === 'logux/subscribe' || type === 'logux/unsubscribe') {
      filtered(true)
      return
    }
    let ctx = this.app.createContext(action, meta)
    let processor = this.app.getProcessor(type)
    try {
      let result = await processor.access(ctx, action, meta)
      if (this.app.unknownTypes[meta.id]) {
        delete this.app.unknownTypes[meta.id]
        this.app.finally(processor, ctx, action, meta)
        filtered(false)
        return
      } else if (!result) {
        this.app.finally(processor, ctx, action, meta)
        this.denyBack(action, meta)
        filtered(false)
        return
      } else {
        filtered(true)
        return
      }
    } catch (e) {
      this.app.undo(action, meta, 'error')
      this.app.emitter.emit('error', e, action, meta)
      filtered(false)
      this.app.finally(processor, ctx, action, meta)
    }
  }

  next() {
    this.data = this.data.slice(2)
    if (this.data.length) {
      this.filterAction(this.data[0], this.data[1])
    } else {
      this.processing = false
      this.destroy()
    }
  }

  waitForProcess() {
    let finish
    let finished = new Promise(resolve => {
      finish = resolve
    })
    if (this.processing) {
      setTimeout(this.waitForProcess, 50)
    } else {
      finish(true)
    }
    return finished
  }

  denyBack(action, meta) {
    this.app.emitter.emit('report', 'denied', { actionId: meta.id })
    let [undoAction, undoMeta] = this.app.buildUndo(action, meta, 'denied')
    undoMeta.clients = (undoMeta.clients || []).concat([this.clientId])
    this.app.log.add(undoAction, undoMeta)
    this.app.debugActionError(meta, `Action "${meta.id}" was denied`)
  }

  destroy() {
    this.app.queues.delete(this.key)
  }
}
