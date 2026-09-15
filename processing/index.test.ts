import {
  type Action,
  type AnyAction,
  MemoryStore,
  type Meta
} from '@logux/core'
import { setTimeout } from 'node:timers/promises'
import { afterEach, expect, it } from 'vitest'

import {
  ProcessingStore,
  ResponseError,
  TestClient,
  TestServer
} from '../index.js'

function privateMethods(obj: object): any {
  return obj
}

class TrackingStore extends MemoryStore {
  failOn: string | undefined = undefined

  writes: string[][] = []

  override async add(
    entries: [AnyAction, Meta][]
  ): Promise<(false | Meta)[]> {
    this.writes.push(entries.map(i => i[0].type))
    if (this.failOn && entries.some(i => i[0].type === this.failOn)) {
      throw new Error('Store is broken')
    }
    return super.add(entries)
  }
}

let destroyable: TestServer | undefined

function createServer(opts: object = {}): TestServer {
  let server = new TestServer(opts)
  destroyable = server
  return server
}

afterEach(async () => {
  if (destroyable) {
    await destroyable.destroy()
    destroyable = undefined
  }
})

it('makes the log an output of the processing', async () => {
  let server = createServer()
  let events: string[] = []
  server.on('add', action => {
    events.push(`add ${action.type}`)
  })
  server.type('FOO', {
    access: () => true,
    process(ctx, action, meta) {
      // `meta.added` exists only after the storage
      expect(meta.added).toBeUndefined()
      events.push('process')
    }
  })

  let client = await server.connect('10')
  await client.process({ type: 'FOO' })

  expect(events).toEqual(['process', 'add FOO', 'add logux/processed'])
})

it('stores only the actions with reasons', async () => {
  let store = new TrackingStore()
  let server = createServer({ store })
  server.type('FOO', { access: () => true })
  server.type('BAR', { access: () => true })
  server.channel('a', {
    access: () => true,
    load() {
      return [{ type: 'LOADED' }, { type: 'KEPT' }]
    }
  })
  server.on('preadd', (action, meta) => {
    if (action.type === 'BAR' || action.type === 'KEPT') {
      meta.reasons.push('test')
    }
  })

  let client = await server.connect('10')
  await client.process({ type: 'FOO' })
  expect(store.writes).toEqual([])

  await client.process({ type: 'BAR' })
  expect(store.writes).toEqual([['BAR']])

  // Only the retained entries of the mixed batch reach the store
  await client.subscribe('a')
  expect(store.writes).toEqual([['BAR'], ['KEPT']])
})

it('delivers and answers with an entirely empty log', async () => {
  let server = createServer()
  server.channel('a', {
    access: () => true,
    load() {
      return [{ type: 'A' }]
    }
  })
  server.type('FOO', {
    access: () => true,
    resend: () => ({ channels: ['a'] })
  })

  let client1 = await server.connect('10')
  let client2 = await server.connect('11')
  await client1.subscribe('a')

  let received = await client1.received(async () => {
    await client2.process({ type: 'FOO' })
  })

  expect(received).toEqual([{ type: 'FOO' }])
  expect(server.log.entries()).toEqual([])
})

it('answers the re-sent command from the retained log', async () => {
  let server = createServer()
  server.log.keepActions()
  let processed = 0
  server.type('FOO', {
    access: () => true,
    process() {
      processed += 1
    }
  })

  let client = await server.connect('10')
  await client.process({ type: 'FOO' }, { id: `1 ${client.nodeId}` })
  // The bounded store could forget the answer
  privateMethods(server).runner.processing.entries.clear()
  await client.process({ type: 'FOO' }, { id: `1 ${client.nodeId}` })

  expect(processed).toEqual(1)
})

it('forgets the oldest outcomes', async () => {
  let store = new ProcessingStore(1)
  let server = createServer({ processingStore: store })
  server.type('FOO', { access: () => true })

  let client = await server.connect('10')
  await client.process({ type: 'FOO' })
  await client.process({ type: 'FOO' })

  expect(store.entries.size).toEqual(1)
})

it('allows to report unknown type in the custom processor', async () => {
  let server = createServer()
  let unknown: string[] = []
  server.otherType({
    access: () => true,
    process(ctx, action, meta) {
      unknown.push(action.type)
      server.unknownType(action, meta)
    }
  })

  // Own actions are reported, but not undone
  await server.process({ type: 'A' }, { channels: ['a'] })
  expect(unknown).toEqual(['A'])

  let client = await server.connect('10')
  await expect(client.process({ type: 'B' })).rejects.toThrow(
    'Server does not have callbacks for B actions'
  )
  expect(unknown).toEqual(['A', 'B'])
})

it('restores the previous filter of the failed subscription', async () => {
  let server = createServer()
  let fail = false
  let filter = (): boolean => true
  server.channel('a', {
    access: () => true,
    filter: () => filter,
    load() {
      if (fail) throw new Error('Broken load')
    }
  })

  let client = await server.connect('10')
  await client.subscribe('a')
  expect(server.subscribers.a![client.nodeId]!.filters).toEqual({
    '{}': filter
  })

  fail = true
  await expect(client.subscribe('a')).rejects.toThrow()

  // The earlier valid subscription is preserved
  expect(server.subscribers.a![client.nodeId]!.filters).toEqual({
    '{}': filter
  })
})

it('does not take old waiting entries as completed commands', async () => {
  let server = createServer()
  server.log.keepActions()
  let processed = 0
  server.type('FOO', {
    access: () => true,
    process() {
      processed += 1
    }
  })

  let client = await server.connect('10')
  // An old entry, which was stored before its processing
  await server.log.add({ type: 'FOO' }, {
    id: `1 ${client.nodeId}`,
    status: 'waiting'
  } as object)
  await client.process({ type: 'FOO' }, { id: `1 ${client.nodeId}` })

  expect(processed).toEqual(1)
})

it('ignores the late completion after the deadline', async () => {
  let server = createServer({ queueTimeout: 50 })
  let errors: string[] = []
  server.on('error', e => {
    errors.push(e.message)
  })
  let finish: (() => void) | undefined
  let aborted = false
  server.type('FOO', {
    access: () => true,
    async process(ctx) {
      ctx.signal.addEventListener('abort', () => {
        aborted = true
      })
      await new Promise<void>(resolve => {
        finish = resolve
      })
    }
  })

  let client = await server.connect('10')
  let answers = await client.received(async () => {
    await expect(client.process({ type: 'FOO' })).rejects.toThrow()
    if (!finish) throw new Error('process was not started')
    finish()
    await setTimeout(50)
  })

  expect(aborted).toBe(true)
  expect(errors).toHaveLength(1)
  // The late completion does not publish the action or a second answer
  expect(answers.map(i => i.type)).toEqual(['logux/undo'])
  expect(server.log.actions()).toEqual([])
})

it('fails the transport when the answer can not be published', async () => {
  let store = new TrackingStore()
  let server = createServer({ store })
  server.log.keepActions()
  server.type('FOO', { access: () => true })

  let client = await server.connect('10')
  store.failOn = 'logux/processed'

  let disconnected = new Promise(resolve => {
    client.node.on('state', () => {
      if (!client.node.connected) resolve(true)
    })
  })
  void client.process({ type: 'FOO' }).catch(() => {})

  expect(await disconnected).toBe(true)
})

it('keeps live updates during the loading', async () => {
  let server = createServer()
  let load: (() => void) | undefined
  server.channel('a', {
    access: () => true,
    async load() {
      await new Promise<void>(resolve => {
        load = resolve
      })
    }
  })

  let client = await server.connect('10')
  let received = await client.received(async () => {
    let subscribing = client.subscribe('a')
    await setTimeout(10)
    await server.log.add({ type: 'LIVE' }, { channels: ['a'] })
    if (!load) throw new Error('load was not started')
    load()
    await subscribing
  })

  expect(received.map(i => i.type)).toEqual(['LIVE', 'logux/processed'])
})

it('keeps the earlier subscription when an extra filter fails', async () => {
  let server = createServer()
  let fail = false
  server.channel('a', {
    access: () => true,
    filter() {
      if (fail) throw new Error('Broken filter')
      return () => true
    }
  })

  let client = await server.connect('10')
  await client.subscribe('a')
  expect(Object.keys(server.subscribers.a!)).toEqual([client.nodeId])

  fail = true
  await expect(
    client.subscribe({
      channel: 'a',
      filter: { category: 'b' },
      type: 'logux/subscribe'
    })
  ).rejects.toThrow()

  expect(server.subscribers.a![client.nodeId]!.filters).toEqual({
    '{}': expect.any(Function)
  })
})

it('does not leave a ghost subscription after the disconnect', async () => {
  let server = createServer()
  let load: (() => void) | undefined
  server.channel('a', {
    access: () => true,
    async load() {
      await new Promise<void>(resolve => {
        load = resolve
      })
    }
  })

  let client = await server.connect('10')
  void client.subscribe('a').catch(() => {})
  await setTimeout(10)
  await client.disconnect()
  if (!load) throw new Error('load was not started')
  load()
  await setTimeout(10)

  expect(server.subscribers).toEqual({})
})

it('runs the subscription again for the new connection', async () => {
  let server = createServer()
  let loaded = 0
  server.channel('a', {
    access: () => true,
    load() {
      loaded += 1
    }
  })

  let client1 = await server.connect('10')
  await client1.subscribe('a')
  expect(loaded).toEqual(1)
  await client1.disconnect()

  // The same node ID does not prove the membership of the new connection
  let client2 = new TestClient(server, '10')
  await client2.connect()
  await client2.process({ channel: 'a', type: 'logux/subscribe' })

  expect(loaded).toEqual(2)
  expect(Object.keys(server.subscribers.a!)).toEqual([client2.nodeId])
})

it('streams pages with ctx.drain()', async () => {
  let server = createServer()
  let pages = 0
  server.channel('a', {
    access: () => true,
    async load(ctx) {
      while (pages < 3) {
        pages += 1
        await ctx.sendBack({ page: pages, type: 'PAGE' } as Action)
        if (!(await ctx.drain())) break
      }
    }
  })

  let client = await server.connect('10')
  let received = await client.subscribe('a')

  expect(received).toEqual([
    { page: 1, type: 'PAGE' },
    { page: 2, type: 'PAGE' },
    { page: 3, type: 'PAGE' }
  ])
})

it('answers only after the delivery was scheduled', async () => {
  let server = createServer()
  let release: (() => void) | undefined
  server.channel('a', {
    access: () => true,
    filter() {
      return async () => {
        await new Promise<void>(resolve => {
          release = resolve
        })
        return true
      }
    }
  })
  server.type('A', {
    access: () => true,
    resend: () => ({ channels: ['a'] })
  })

  let subscriber = await server.connect('10')
  await subscriber.subscribe('a')

  let answered = false
  let received = await subscriber.received(async () => {
    void server.process({ type: 'A' }).then(() => {
      answered = true
    })
    await setTimeout(10)
    // The asynchronous channel filter did not finish yet
    expect(answered).toBe(false)

    if (!release) throw new Error('filter was not called')
    release()
    await setTimeout(10)
  })

  expect(answered).toBe(true)
  expect(received).toEqual([{ type: 'A' }])
})

it('does not start the next action before the delivery', async () => {
  let server = createServer()
  let calls: string[] = []
  let release: (() => void) | undefined
  server.channel('a', {
    access: () => true,
    filter() {
      return async () => {
        await new Promise<void>(resolve => {
          release = resolve
        })
        return true
      }
    }
  })
  server.type('A', {
    access() {
      calls.push('access A')
      return true
    },
    resend: () => ({ channels: ['a'] })
  })
  server.type('B', {
    access() {
      calls.push('access B')
      return true
    }
  })

  let subscriber = await server.connect('10')
  await subscriber.subscribe('a')
  let author = await server.connect('11')

  void author.process({ type: 'A' }).catch(() => {})
  await setTimeout(10)
  void author.process({ type: 'B' }).catch(() => {})
  await setTimeout(10)

  expect(calls).toEqual(['access A'])

  if (!release) throw new Error('filter was not called')
  release()
  await setTimeout(10)
  expect(calls).toEqual(['access A', 'access B'])
})

it('settles the task by server.undo() from a callback', async () => {
  let server = createServer()
  let calls: string[] = []
  server.type('FOO', {
    access: () => true,
    finally() {
      calls.push('finally')
    },
    async process(ctx, action, meta) {
      await server.undo(action, meta, 'magic')
      calls.push('after undo')
    }
  })

  let client = await server.connect('10')
  let answers = await client.received(async () => {
    await expect(client.process({ type: 'FOO' })).rejects.toThrow()
    await setTimeout(10)
  })

  expect(calls).toEqual(['after undo', 'finally'])
  expect(answers.map(i => i.type)).toEqual(['logux/undo'])
  expect((answers[0] as any).reason).toEqual('magic')
})

it('installs no membership when accessAndLoad denies', async () => {
  let server = createServer()
  server.channel('a', {
    async accessAndLoad() {
      await server.log.add({ type: 'LIVE' }, { channels: ['a'] })
      throw new ResponseError(403, '/a')
    }
  })

  let client = await server.connect('10')
  let received = await client.received(async () => {
    await expect(client.subscribe('a')).rejects.toThrow('Action was denied')
  })

  expect(server.subscribers).toEqual({})
  expect(received.map(i => i.type)).toEqual(['logux/undo'])
})

it('takes an action without a handler as a fact from the server', async () => {
  let server = createServer()
  let subscriber = await server.connect('10')
  server.channel('a', { access: () => true })
  await subscriber.subscribe('a')

  let received = await subscriber.received(async () => {
    await server.process({ type: 'FACT' }, { channels: ['a'] })
  })
  expect(received).toEqual([{ type: 'FACT' }])

  let client = await server.connect('11')
  await expect(client.process({ type: 'FACT' })).rejects.toThrow(
    'Server does not have callbacks for FACT actions'
  )
})

it('answers the queued tasks of the undone action', async () => {
  let server = createServer()
  let calls: string[] = []
  server.type(/^[ABCD]$/, {
    access: (ctx, action) => action.type !== 'B',
    async process(ctx, action) {
      await setTimeout(10)
      calls.push(action.type)
    }
  })

  let client = await server.connect('10')
  let answers = await client.received(async () => {
    void client.process({ type: 'A' }).catch(() => {})
    void client.process({ type: 'B' }).catch(() => {})
    void client.process({ type: 'C' }).catch(() => {})
    await setTimeout(100)
    // The queue works again for the actions after the undone one
    await client.process({ type: 'D' })
  })

  expect(calls).toEqual(['A', 'D'])
  expect(answers.map(i => i.type)).toEqual([
    'logux/processed',
    'logux/undo',
    'logux/undo',
    'logux/processed'
  ])
})

it('continues the queue and reports the detached callback', async () => {
  let server = createServer({ queueTimeout: 50 })
  let reports: string[] = []
  server.on('report', name => {
    reports.push(name)
  })
  let calls: string[] = []
  server.type('HANG', {
    access: () => true,
    process: () => new Promise(() => {})
  })
  server.type('NEXT', {
    access: () => true,
    process: () => {
      calls.push('NEXT')
    }
  })

  let client = await server.connect('10')
  void client.process({ type: 'HANG' }).catch(() => {})
  await setTimeout(100)
  await client.process({ type: 'NEXT' })

  expect(calls).toEqual(['NEXT'])

  await server.destroy()
  destroyable = undefined
  expect(reports).toContain('destroyDetached')
})

it('publishes the subscription without a second execution', async () => {
  let server = createServer()
  server.log.keepActions()
  let loaded = 0
  server.channel('a', {
    access: () => true,
    load() {
      loaded += 1
    }
  })

  let client = await server.connect('10')
  await client.subscribe('a')
  await setTimeout(10)

  expect(loaded).toEqual(1)
  expect(server.log.actions()).toEqual([
    { channel: 'a', type: 'logux/subscribe' },
    { id: `2 ${client.nodeId}`, type: 'logux/processed' }
  ])
})
