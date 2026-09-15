import { parseId } from '@logux/core'

import { Context } from '../context/index.js'
import { ProcessingStore } from '../processing-store/index.js'
import { QueueManager } from '../queue-manager/index.js'

const RESEND_META = ['channels', 'users', 'clients', 'nodes']

function subscriberFilterId(action) {
  return JSON.stringify(action.filter || {})
}

function isResponseError(e, statusCode) {
  return e.name === 'ResponseError' && e.statusCode === statusCode
}

export async function wasNot403(cb) {
  try {
    await cb()
    return true
  } catch (e) {
    if (isResponseError(e, 403)) {
      return false
    }
    throw e
  }
}

function denyOn403(step) {
  return async task => {
    try {
      await step(task)
    } catch (e) {
      if (!isResponseError(e, 403)) throw e
      await task.server.undo(task.action, task.meta, 'denied')
    }
  }
}

function notFoundOn404(step) {
  return async task => {
    try {
      await step(task)
    } catch (e) {
      if (e.name !== 'LoguxNotFoundError' && !isResponseError(e, 404)) throw e
      await task.server.undo(task.action, task.meta, 'notFound')
    }
  }
}

// Trusted server submissions skip the client permission check,
// but a channel always checks its own access
function skipTrusted(step) {
  return task => (task.trusted ? undefined : step(task))
}

async function runAccess(task, access) {
  let result = await access(task.ctx, task.action, task.meta)
  if (task.outcome || result) return
  await task.server.undo(task.action, task.meta, 'denied')
}

async function runResend(task, resend) {
  if (!resend) return
  let result = await resend(task.ctx, task.action, task.meta)
  if (task.outcome || !result) return
  if (typeof result === 'string') {
    result = { channels: [result] }
  } else if (Array.isArray(result)) {
    result = { channels: result }
  }
  for (let key of RESEND_META) {
    if (result[key]) task.meta[key] = result[key]
  }
}

function checkClient(task) {
  let client = task.server.clientIds.get(task.ctx.clientId)
  if (client && (!task.client || client === task.client)) return true
  // A disconnected or replaced client must not get a ghost subscription
  task.server.emitter.emit('subscriptionCancelled')
  task.settle({ type: 'cancelled' })
  return false
}

async function installMembership(task) {
  if (!checkClient(task)) return
  let { action, ctx, handler, meta, server } = task
  let channel = action.channel
  let nodeId = ctx.nodeId
  if (channel === '__proto__' || nodeId === '__proto__') return

  let filter = true
  if (handler.filter) {
    filter = await handler.filter(ctx, action, meta)
    if (task.outcome || !checkClient(task)) return
  }

  server.emitter.emit('report', 'subscribed', { actionId: meta.id, channel })
  if (!server.subscribers[channel]) {
    server.subscribers[channel] = {}
    server.emitter.emit('subscribing', action, meta)
  }

  let filterId = subscriberFilterId(action)
  let subscriber = server.subscribers[channel][nodeId]
  // The earlier subscription with the same filter stays as it is
  if (subscriber && filterId in subscriber.filters) return

  server.subscribers[channel][nodeId] = {
    filters: { ...subscriber?.filters, [filterId]: filter },
    unsubscribe: handler.unsubscribe
      ? (unsubscribeAction, unsubscribeMeta) =>
          handler.unsubscribe(ctx, unsubscribeAction, unsubscribeMeta)
      : undefined
  }
  // The membership is installed before `load()` to keep the live updates
  task.installed = { channel, filterId, nodeId }
}

async function sendLoaded(task, load) {
  let loaded = load && (await load(task.ctx, task.action, task.meta))
  if (task.outcome || !checkClient(task)) return
  if (loaded) await task.ctx.sendBack(loaded)
  if (task.outcome) return
  task.server.emitter.emit(
    'subscribed',
    task.action,
    task.meta,
    Date.now() - task.start
  )
}

export function normalizeType(name, callbacks, queue) {
  if (!callbacks || (!callbacks.access && !callbacks.accessAndProcess)) {
    throw new Error(`${name} must have access callback`)
  }

  let steps
  if (callbacks.accessAndProcess) {
    steps = [
      denyOn403(task => {
        return callbacks.accessAndProcess(task.ctx, task.action, task.meta)
      }),
      task => runResend(task, callbacks.resend)
    ]
  } else {
    steps = [
      skipTrusted(task => runAccess(task, callbacks.access)),
      task => runResend(task, callbacks.resend),
      task => callbacks.process?.(task.ctx, task.action, task.meta)
    ]
  }

  return { duplicate: 'command', finally: callbacks.finally, queue, steps }
}

export function normalizeChannel(name, callbacks, queue) {
  if (!callbacks || (!callbacks.access && !callbacks.accessAndLoad)) {
    throw new Error(`${name} must have access callback`)
  }

  let steps
  if (callbacks.accessAndLoad) {
    steps = [
      denyOn403(
        notFoundOn404(async task => {
          task.loaded = await callbacks.accessAndLoad(
            task.ctx,
            task.action,
            task.meta
          )
        })
      ),
      installMembership,
      task => sendLoaded(task, () => task.loaded)
    ]
  } else {
    steps = [
      task => runAccess(task, callbacks.access),
      installMembership,
      notFoundOn404(task => sendLoaded(task, callbacks.load))
    ]
  }

  return {
    duplicate: 'connection',
    filter: callbacks.filter,
    finally: callbacks.finally,
    queue,
    steps,
    unsubscribe: callbacks.unsubscribe
  }
}

export function getRegexType(server, type) {
  for (let regexp of server.regexTypes.keys()) {
    if (type.match(regexp) !== null) {
      return server.regexTypes.get(regexp)
    }
  }
  return undefined
}

function matchChannel(server, name) {
  if (typeof name !== 'string' || name === '__proto__') return undefined
  let channels = server.channels
  if (server.otherSubscriber) {
    channels = channels.concat([server.otherSubscriber])
  }
  for (let channel of channels) {
    let params = channel.pattern
      ? channel.pattern(name)
      : name.match(channel.regexp)
    if (params) return { handler: channel, params }
  }
  return undefined
}

export function removeMembership(server, clientNodeId, action, meta) {
  if (action.channel === '__proto__' || clientNodeId === '__proto__') return
  if (server.subscribers[action.channel]) {
    let subscriber = server.subscribers[action.channel][clientNodeId]
    if (subscriber) {
      if (subscriber.unsubscribe) {
        subscriber.unsubscribe(action, meta)
      }
      let filterId = subscriberFilterId(action)
      delete subscriber.filters[filterId]
      if (Object.keys(subscriber.filters).length === 0) {
        delete server.subscribers[action.channel][clientNodeId]
      }
      if (Object.keys(server.subscribers[action.channel]).length === 0) {
        delete server.subscribers[action.channel]
      }
    }
  }
  server.emitter.emit('unsubscribed', action, meta, clientNodeId)
  server.emitter.emit('report', 'unsubscribed', {
    actionId: meta.id,
    channel: action.channel
  })
}

const UNKNOWN_TYPE = {
  duplicate: 'command',
  queue: 'main',
  steps: [task => task.server.unknownType(task.action, task.meta)]
}

// The server’s own actions are facts: they need no type definition
const SERVER_FACT = { duplicate: 'command', queue: 'main', steps: [] }

const WRONG_CHANNEL = {
  duplicate: 'connection',
  queue: 'main',
  steps: [task => task.server.wrongChannel(task.action, task.meta)]
}

const UNSUBSCRIBE = [
  task => removeMembership(task.server, task.ctx.nodeId, task.action, task.meta)
]

// The only place which knows about channels: the queue, the runner
// and the publisher have no subscription branches
export function resolveHandler(server, action, meta) {
  let type = action.type
  if (type === 'logux/subscribe' || type === 'logux/unsubscribe') {
    let match = matchChannel(server, action.channel)
    if (type === 'logux/unsubscribe' && typeof action.channel === 'string') {
      // Unsubscribe needs no channel callbacks, but keeps the channel’s queue
      return {
        duplicate: 'connection',
        queue: match ? match.handler.queue : 'main',
        steps: UNSUBSCRIBE
      }
    }
    if (!match) return WRONG_CHANNEL
    return { ...match.handler, params: match.params }
  }

  let handler =
    server.types[type] || getRegexType(server, type) || server.otherProcessor
  if (handler) return handler
  return parseId(meta.id).userId === 'server' ? SERVER_FACT : UNKNOWN_TYPE
}

function ignore() {}

function addTo(map, key, value) {
  let values = map.get(key)
  if (!values) {
    values = new Set()
    map.set(key, values)
  }
  values.add(value)
}

function removeFrom(map, key, value) {
  let values = map.get(key)
  if (!values) return
  values.delete(value)
  if (values.size === 0) map.delete(key)
}

function undoError(meta, reason) {
  let error = new Error(`Action "${meta.id}" was undone with ${reason} reason`)
  error.reason = reason
  return error
}

export class Task {
  constructor(runner, { action, client, handler, key, meta, trusted }) {
    this.action = action
    this.client = client
    this.controller = new AbortController()
    this.handler = handler
    this.key = key
    this.meta = meta
    this.runner = runner
    this.server = runner.server
    this.start = Date.now()
    this.trusted = trusted

    this.promise = new Promise((resolve, reject) => {
      this.resolveTask = resolve
      this.rejectTask = reject
    })
    // The deadline stops the waiting for the application callback
    this.abandoned = new Promise(resolve => {
      this.abandon = resolve
    })
  }

  cleanup() {
    this.controller.abort()
    if (this.outcome.type !== 'processed' && this.installed) {
      let { nodeId } = this.installed
      removeMembership(this.server, nodeId, this.action, this.meta)
      this.installed = undefined
    }
    if (this.ctx && this.handler.finally) {
      try {
        this.handler.finally(this.ctx, this.action, this.meta)
      } catch (e) {
        this.server.emitter.emit('error', e, this.action, this.meta)
      }
    }
  }

  async runSteps() {
    this.#startTimer()
    let handler = this.handler
    if (handler.duplicate === 'command' && this.client && !this.trusted) {
      // The log already has the action: it was processed before the answer
      // was lost. An old entry, stored before its processing, is not a receipt
      let [stored, meta] = await this.server.log.byId(this.meta.id)
      if (stored && (!meta.status || meta.status === 'processed')) {
        this.server.emitter.emit('report', 'duplicate', {
          actionId: this.meta.id
        })
        this.settle({ replayed: true, type: 'processed' })
      }
    }
    for (let step of handler.steps) {
      if (this.outcome) break
      await step(this)
    }
  }

  settle(outcome) {
    if (this.outcome) return false
    this.outcome = outcome
    return true
  }

  #startTimer() {
    let ms = this.server.options.queueTimeout
    if (!ms) return
    let timer = setTimeout(() => {
      let error = new Error(
        `Action "${this.meta.id}" was not processed in ${ms} ms`
      )
      this.controller.abort(error)
      if (this.settle({ reason: 'error', type: 'undo' })) {
        this.error = error
        this.runner.detached.add(this)
        this.server.emitter.emit('error', error, this.action, this.meta)
      }
      // The callback can not be stopped, but the queue must move on
      this.abandon()
    }, ms)
    if (timer.unref) timer.unref()
    this.controller.signal.addEventListener('abort', () => {
      clearTimeout(timer)
    })
  }
}

export class ActionRunner {
  constructor(server) {
    this.active = new Set()
    this.byId = new Map()
    this.clientTasks = new Map()
    this.detached = new Set()
    this.processing = server.options.processingStore || new ProcessingStore()
    this.queues = new QueueManager(this)
    this.server = server
  }

  async run(task) {
    // A task, which was answered before its turn, never runs its callbacks
    if (!task.outcome) {
      await Promise.race([this.#runSteps(task), task.abandoned])
    }
    task.settle({ type: 'processed' })
    task.cleanup()

    let failed
    try {
      await this.#answer(task)
    } catch (e) {
      // The answer was not published: do not acknowledge the completion
      e.transportFailure = true
      failed = e
    }
    this.#forget(task)

    if (task.outcome.type === 'undo' && task.queueKey) {
      for (let waiting of this.queues.cancelPending(task.queueKey)) {
        void this.server.undo(waiting.action, waiting.meta, 'error')
        void this.run(waiting)
      }
    }
    if (task.outcome.type !== 'cancelled') {
      let latency = Date.now() - task.start
      this.server.emitter.emit('processed', task.action, task.meta, latency)
    }

    if (failed) {
      task.rejectTask(failed)
    } else if (task.outcome.type === 'undo') {
      task.rejectTask(task.error || undoError(task.meta, task.outcome.reason))
    } else {
      task.resolveTask(task.meta)
    }
  }

  async #runSteps(task) {
    let { action, handler, meta } = task
    task.ctx = new Context(this.server, meta, task)
    if (handler.params) task.ctx.params = handler.params
    try {
      await task.runSteps()
    } catch (e) {
      task.error = e
      this.server.emitter.emit('error', e, action, meta)
      await this.server.undo(action, meta, 'error')
    }
    // The callback of an abandoned task returned, nothing is left behind
    this.detached.delete(task)
  }

  // The server’s `batch` listener delivers every written action
  async #answer({ action, client, meta, outcome }) {
    if (outcome.type === 'processed') {
      if (!outcome.replayed) {
        // Custom `Node` classes send the log to their own client by themselves
        if (client && client.node.received) client.node.received[meta.id] = true
        await this.server.log.add([[action, meta]])
      }
      let { clientId, userId } = parseId(meta.id)
      if (userId !== 'server') {
        await this.server.log.add(
          { id: meta.id, type: 'logux/processed' },
          { clients: [clientId] }
        )
      }
    } else if (outcome.type === 'undo') {
      // The outcome was already reported when it was decided
      await this.server.publishUndo(action, meta, outcome.reason, outcome.extra)
    }
    await this.server.publisher.settled()
  }

  cleanConnection(client) {
    this.processing.removeConnection(client.key)
    this.clientTasks.delete(client)
  }

  #forget(task) {
    if (this.byId.get(task.meta.id) === task) this.byId.delete(task.meta.id)
    if (task.outcome.type === 'cancelled') {
      this.processing.delete(task.key)
    } else {
      // Only the subscription outcomes belong to the connection
      let connection =
        task.client && task.handler.duplicate === 'connection'
          ? task.client.key
          : undefined
      this.processing.finish(task.key, task.outcome, connection)
    }
  }

  submit({ action, client, meta = {}, trusted = false }) {
    this.server.prepareMeta(meta, client)
    let handler = resolveHandler(this.server, action, meta)

    // Reserve the duplicate key before any awaited work
    let key =
      handler.duplicate === 'connection' && client
        ? `${client.key} ${meta.id}`
        : meta.id

    let found = this.processing.get(key)
    if (found) {
      this.server.emitter.emit('report', 'duplicate', { actionId: meta.id })
      if (found.task) return found.task.promise
      let outcome = { ...found.outcome, replayed: true }
      return this.#answer({ action, client, meta, outcome }).then(() => {
        if (outcome.type === 'undo') throw undoError(meta, outcome.reason)
        return meta
      })
    }

    let task = new Task(this, { action, client, handler, key, meta, trusted })
    this.processing.start(key, task)
    this.byId.set(meta.id, task)

    let tracking = task.promise.then(ignore, ignore)
    this.active.add(tracking)
    if (client) addTo(this.clientTasks, client, tracking)
    void tracking.then(() => {
      this.active.delete(tracking)
      if (client) removeFrom(this.clientTasks, client, tracking)
    })

    if (trusted) {
      // Nested commands must not wait for the task, which awaits them
      void this.run(task)
    } else {
      this.queues.push(`${parseId(meta.id).clientId}/${handler.queue}`, task)
    }
    return task.promise
  }

  async waitForClient(client) {
    let tasks = this.clientTasks.get(client)
    if (!tasks) return
    while (tasks.size > 0) {
      await Promise.all(tasks)
    }
  }

  async waitForTasks() {
    while (this.active.size > 0) {
      await Promise.all(this.active)
    }
  }
}
