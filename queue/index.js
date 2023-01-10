export class Queue {
  constructor(app, clientId, key) {
    this.app = app
    this.clientId = clientId
    this.data = []
    this.processing = false
    this.key = key
  }

  add(action, meta) {
    this.data.push(action, meta)
    if (!this.processing) {
      this.processing = true
      this.processAction(this.data[0], this.data[1])
    }
  }

  async processAction(action, meta) {
    let ctx = this.app.createContext(action, meta)
    let type = action.type
    let processor = this.app.getProcessor(type)

    if (type === 'logux/subscribe' || type === 'logux/unsubscribe') {
      await this.app.log.add(action, meta).then(() => this.remove())
      return
    }
    try {
      let result = await processor.access(ctx, action, meta)
      if (this.app.unknownTypes[meta.id]) {
        delete this.app.unknownTypes[meta.id]
        this.app.finally(processor, ctx, action, meta)
        this.remove()
        return
      } else if (!result) {
        this.app.finally(processor, ctx, action, meta)
        await this.denyBack(action, meta).then(() => {
          this.remove()
        })
        return
      } else {
        await this.app.log.add(action, meta).then(() => this.remove())
        return
      }
    } catch (e) {
      this.app.undo(action, meta, 'error')
      this.app.emitter.emit('error', e, action, meta)
      this.app.finally(processor, ctx, action, meta)
      this.remove()
    }
  }

  remove() {
    this.data = this.data.slice(2)
    if (this.data.length) {
      this.processAction(this.data[0], this.data[1])
    } else {
      this.processing = false
      this.destroy()
    }
  }

  waitForProcess() {
    return new Promise(resolve => {
      if (this.processing) {
        setTimeout(this.waitForProcess, 50)
      } else {
        this.destroy()
        resolve()
      }
    })
  }

  async denyBack(action, meta) {
    this.app.emitter.emit('report', 'denied', { actionId: meta.id })
    let [undoAction, undoMeta] = this.app.buildUndo(action, meta, 'denied')
    undoMeta.clients = (undoMeta.clients || []).concat([this.clientId])
    await this.app.log.add(undoAction, undoMeta).then(() => {
      this.app.debugActionError(meta, `Action "${meta.id}" was denied`)
    })
  }

  destroy() {
    this.app.queues.delete(this.key)
  }
}
