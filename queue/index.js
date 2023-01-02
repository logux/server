export class QueueChannel {
  constructor(processing = false, data = []) {
    this.processing = processing
    this.data = data
  }
}

export class Queue {
  constructor(app, queues, key) {
    this.app = app
    this.queues = queues
    this.key = key
    this.clientId = undefined
  }

  setClientId(clientId) {
    this.clientId = clientId
    return this.clientId
  }

  add(action, meta) {
    let queueKey
    if (this.queues.size === 1) {
      queueKey = 'main'
    } else {
      let labels = Array.from(this.queues.keys())
      let type = action.type
      let actionChannel = type.slice(0, type.indexOf('/'))
      if (labels.includes(actionChannel)) {
        queueKey = actionChannel
      } else if (type === 'logux/subscribe' || type === 'logux/unsubscribe') {
        let channel = action.channel
        if (labels.includes(channel)) {
          queueKey = action.channel
        } else if (
          channel.indexOf('/') &&
          labels.includes(channel.slice(0, channel.indexOf('/')))
        ) {
          queueKey = channel.slice(0, channel.indexOf('/'))
        } else queueKey = 'main'
      } else {
        queueKey = 'main'
      }
    }
    let queue = this.queues.get(queueKey)
    queue.data.push(action, meta)
    if (!queue.processing) {
      queue.processing = true
      this.processAction(queue.data[0], queue.data[1], queueKey)
    }
  }

  async processAction(action, meta, queueKey) {
    let ctx = this.app.createContext(action, meta)
    let type = action.type
    let processor = this.app.getProcessor(type)

    if (type === 'logux/subscribe' || type === 'logux/unsubscribe') {
      await this.app.log.add(action, meta).then(() => this.remove(queueKey))
      return
    }
    try {
      let result = await processor.access(ctx, action, meta)
      if (this.app.unknownTypes[meta.id]) {
        delete this.app.unknownTypes[meta.id]
        this.app.finally(processor, ctx, action, meta)
        this.remove(queueKey)
        return
      } else if (!result) {
        this.app.finally(processor, ctx, action, meta)
        await this.denyBack(action, meta).then(() => {
          this.remove(queueKey)
        })
        return
      } else {
        await this.app.log.add(action, meta).then(() => this.remove(queueKey))
        return
      }
    } catch (e) {
      this.app.undo(action, meta, 'error')
      this.app.emitter.emit('error', e, action, meta)
      this.app.finally(processor, ctx, action, meta)
      this.remove(queueKey)
    }
  }

  remove(queueKey) {
    let queue = this.queues.get(queueKey)
    queue.data = queue.data.slice(2)
    if (queue.data.length) {
      this.processAction(queue.data[0], queue.data[1], queueKey)
    } else {
      queue.processing = false
    }
  }

  waitForProcess() {
    return new Promise(resolve => {
      let leftToProcess = Array.from(this.queues.values).filter(
        queue => !queue.processing
      )
      if (!leftToProcess[0]) {
        resolve()
      } else {
        setTimeout(this.waitForProcess(leftToProcess, 50))
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

  async destroy() {
    await this.waitForProcess().then(() => {
      this.app.queues.delete(this.key)
    })
  }
}
