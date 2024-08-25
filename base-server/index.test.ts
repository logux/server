import { defineAction } from '@logux/actions'
import {
  type Action,
  Log,
  MemoryStore,
  type TestLog,
  TestTime
} from '@logux/core'
import { restoreAll, spy, type Spy, spyOn } from 'nanospy'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import WebSocket from 'ws'

import {
  BaseServer,
  type BaseServerOptions,
  type ServerMeta
} from '../index.js'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')

const DEFAULT_OPTIONS = {
  subprotocol: '0.0.0',
  supports: '0.x'
}
const CERT = join(ROOT, 'test/fixtures/cert.pem')
const KEY = join(ROOT, 'test/fixtures/key.pem')

let lastPort = 9111

function createServer(
  options: Partial<BaseServerOptions> = {}
): BaseServer<{}, TestLog<ServerMeta>> {
  let opts = {
    ...DEFAULT_OPTIONS,
    ...options
  }
  if (typeof opts.time === 'undefined') {
    opts.time = new TestTime()
    opts.id = 'uuid'
  }
  if (typeof opts.port === 'undefined') {
    lastPort += 1
    opts.port = lastPort
  }

  let created = new BaseServer<{}, TestLog<ServerMeta>>(opts)
  created.auth(() => true)

  destroyable = created

  return created
}

let destroyable: BaseServer | undefined
let httpServer: http.Server | undefined

function createReporter(opts: Partial<BaseServerOptions> = {}): {
  app: BaseServer<{}, TestLog<ServerMeta>>
  names: string[]
  reports: [string, any][]
} {
  let names: string[] = []
  let reports: [string, any][] = []

  let app = createServer(opts)
  app.on('report', (name: string, details?: any) => {
    names.push(name)
    if (details?.meta) {
      details.meta = JSON.parse(JSON.stringify(details.meta))
    }
    reports.push([name, details])
  })
  return { app, names, reports }
}

let originEnv = process.env.NODE_ENV

function privateMethods(obj: object): any {
  return obj
}

function emit(obj: any, event: string, ...args: any): void {
  obj.emitter.emit(event, ...args)
}

async function catchError(cb: () => Promise<any>): Promise<Error> {
  try {
    await cb()
  } catch (e) {
    if (e instanceof Error) return e
  }
  throw new Error('Error was not thrown')
}

function calls(fn: Function | undefined): any[][] {
  return (fn as any as Spy).calls
}

function called(fn: Function | undefined): boolean {
  return (fn as any as Spy).called
}

function callCount(fn: Function | undefined): number {
  return (fn as any as Spy).callCount
}

afterEach(async () => {
  restoreAll()
  process.env.NODE_ENV = originEnv
  if (destroyable) {
    await destroyable.destroy()
    destroyable = undefined
  }
  if (httpServer) httpServer.close()
})

it('saves server options', () => {
  let app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x'
  })
  expect(app.options.supports).toEqual('0.x')
})

it('generates node ID', () => {
  let app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x'
  })
  expect(app.nodeId).toMatch(/^server:[\w-]+$/)
})

it('throws on missed subprotocol', () => {
  expect(() => {
    new BaseServer({})
  }).toThrow(/Missed `subprotocol` option/)
})

it('throws on missed supported subprotocols', () => {
  expect(() => {
    new BaseServer({ subprotocol: '0.0.0' })
  }).toThrow(/Missed `supports` option/)
})

it('sets development environment by default', () => {
  delete process.env.NODE_ENV
  let app = new BaseServer(DEFAULT_OPTIONS)
  expect(app.env).toEqual('development')
})

it('takes environment from NODE_ENV', () => {
  process.env.NODE_ENV = 'production'
  let app = new BaseServer(DEFAULT_OPTIONS)
  expect(app.env).toEqual('production')
})

it('sets environment from user', () => {
  let app = new BaseServer({
    env: 'production',
    subprotocol: '0.0.0',
    supports: '0.x'
  })
  expect(app.env).toEqual('production')
})

it('uses cwd as default root', () => {
  let app = new BaseServer(DEFAULT_OPTIONS)
  expect(app.options.root).toEqual(process.cwd())
})

it('uses user root', () => {
  let app = new BaseServer({
    root: '/a',
    subprotocol: '0.0.0',
    supports: '0.x'
  })
  expect(app.options.root).toEqual('/a')
})

it('creates log with default store', () => {
  let app = new BaseServer(DEFAULT_OPTIONS)
  expect(app.log instanceof Log).toBe(true)
  expect(app.log.store instanceof MemoryStore).toBe(true)
})

it('creates log with custom store', () => {
  let store = new MemoryStore()
  let app = new BaseServer({
    store,
    subprotocol: '0.0.0',
    supports: '0.x'
  })
  expect(app.log.store).toBe(store)
})

it('uses test time and ID', () => {
  let store = new MemoryStore()
  let app = new BaseServer({
    id: 'uuid',
    store,
    subprotocol: '0.0.0',
    supports: '0.x',
    time: new TestTime()
  })
  expect(app.log.store).toEqual(store)
  expect(app.log.generateId()).toEqual('1 server:uuid 0')
})

it('destroys application without runned server', async () => {
  let app = new BaseServer(DEFAULT_OPTIONS)
  await app.destroy()
  app.destroy()
})

it('throws without authenticator', async () => {
  expect.assertions(1)
  let app = new BaseServer(DEFAULT_OPTIONS)
  let error = await catchError(() => app.listen())
  expect(error.message).toMatch(/authentication/)
})

it('sets default ports and hosts', () => {
  let app = createServer()
  expect(app.options.port).toEqual(31337)
  expect(app.options.host).toEqual('127.0.0.1')
})

it('uses user port', () => {
  let app = createServer({ port: 1337 })
  expect(app.options.port).toEqual(1337)
})

it('throws a error on key without certificate', () => {
  expect(() => {
    createServer({ key: readFileSync(KEY).toString() })
  }).toThrow(/set `cert` option/)
})

it('throws a error on certificate without key', () => {
  expect(() => {
    createServer({ cert: readFileSync(CERT).toString() })
  }).toThrow(/set `key` option/)
})

it('uses HTTPS', async () => {
  let app = createServer({
    cert: readFileSync(CERT).toString(),
    key: readFileSync(KEY).toString()
  })
  await app.listen()
  expect(privateMethods(app).httpServer instanceof https.Server).toBe(true)
})

it('loads keys by absolute path', async () => {
  let app = createServer({
    cert: CERT,
    key: KEY
  })
  await app.listen()
  expect(privateMethods(app).httpServer instanceof https.Server).toBe(true)
})

it('loads keys by relative path', async () => {
  let app = createServer({
    cert: 'fixtures/cert.pem',
    key: 'fixtures/key.pem',
    root: join(ROOT, 'test/')
  })
  await app.listen()
  expect(privateMethods(app).httpServer instanceof https.Server).toBe(true)
})

it('supports object in SSL key', async () => {
  let app = createServer({
    cert: readFileSync(CERT).toString(),
    key: { pem: readFileSync(KEY).toString() }
  })
  await app.listen()
  expect(privateMethods(app).httpServer instanceof https.Server).toBe(true)
})

it('reporters on start listening', async () => {
  let test = createReporter({
    backend: 'http://127.0.0.1:3000/logux',
    controlSecret: 'secret',
    redis: '//localhost'
  })
  let pkgFile = readFileSync(join(ROOT, 'package.json'))
  let pkg = JSON.parse(pkgFile.toString())

  privateMethods(test.app).listenNotes.prometheus =
    'http://127.0.0.1:31338/prometheus'

  let promise = test.app.listen()
  expect(test.reports).toEqual([])

  await promise
  expect(test.reports).toEqual([
    [
      'listen',
      {
        backend: 'http://127.0.0.1:3000/logux',
        cert: false,
        controlMask: '127.0.0.1/8',
        controlSecret: 'secret',
        environment: 'test',
        host: '127.0.0.1',
        loguxServer: pkg.version,
        nodeId: 'server:uuid',
        notes: {
          prometheus: 'http://127.0.0.1:31338/prometheus'
        },
        port: test.app.options.port,
        redis: '//localhost',
        server: false,
        subprotocol: '0.0.0',
        supports: '0.x'
      }
    ]
  ])
})

it('reporters on log events', async () => {
  let test = createReporter()
  test.app.type('A', { access: () => true })
  test.app.type('B', { access: () => true })
  await test.app.log.add({ type: 'A' }, { reasons: ['some'] })
  await test.app.log.add({ type: 'B' })
  await test.app.log.removeReason('some')
  expect(test.reports).toEqual([
    [
      'add',
      {
        action: {
          type: 'A'
        },
        meta: {
          added: 1,
          id: '1 server:uuid 0',
          reasons: ['some'],
          server: 'server:uuid',
          status: 'waiting',
          subprotocol: '0.0.0',
          time: 1
        }
      }
    ],
    [
      'addClean',
      {
        action: {
          type: 'B'
        },
        meta: {
          id: '2 server:uuid 0',
          reasons: [],
          server: 'server:uuid',
          status: 'waiting',
          subprotocol: '0.0.0',
          time: 2
        }
      }
    ],
    [
      'clean',
      {
        actionId: '1 server:uuid 0'
      }
    ]
  ])
})

it('reporters on destroying', () => {
  let test = createReporter()
  let promise = test.app.destroy()
  expect(test.reports).toEqual([['destroy', undefined]])
  return promise
})

it('creates a client on connection', async () => {
  let app = createServer()
  await app.listen()
  let ws = new WebSocket(`ws://127.0.0.1:${app.options.port}`)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  expect(app.connected.size).toEqual(1)
  expect(app.connected.get('1')?.remoteAddress).toEqual('127.0.0.1')
})

it('creates a client manually', () => {
  let app = createServer()
  app.addClient({
    on: () => {
      return () => true
    },
    ws: {
      _socket: {
        remoteAddress: '127.0.0.1'
      },
      upgradeReq: {
        headers: {}
      }
    }
  } as any)
  expect(app.connected.size).toEqual(1)
  expect(app.connected.get('1')?.remoteAddress).toEqual('127.0.0.1')
})

it('sends debug message to clients on runtimeError', () => {
  let app = createServer()
  app.connected.set('1', {
    connection: {
      connected: true,
      send: spy()
    },
    destroy: () => false
  } as any)
  app.connected.set('2', {
    connection: {
      connected: false,
      send: spy()
    },
    destroy: () => false
  } as any)
  app.connected.set('3', {
    connection: {
      connected: true,
      send: () => {
        throw new Error()
      }
    },
    destroy: () => false
  } as any)

  let error = new Error('Test Error')
  error.stack = `${error.stack?.split('\n')[0]}\nfake stacktrace`

  app.debugError(error)
  expect(calls(app.connected.get('1')?.connection.send)).toEqual([
    [['debug', 'error', 'Error: Test Error\n' + 'fake stacktrace']]
  ])
  expect(called(app.connected.get('2')?.connection.send)).toBe(false)
})

it('disconnects client on destroy', () => {
  let app = createServer()
  app.connected.set('1', { destroy: spy() } as any)
  app.destroy()
  expect(callCount(app.connected.get('1')?.destroy)).toEqual(1)
})

it('accepts custom HTTP server', async () => {
  httpServer = http.createServer()
  let app = createServer({ server: httpServer })

  await new Promise<void>(resolve => {
    httpServer?.listen(app.options.port, resolve)
  })
  await app.listen()

  let ws = new WebSocket(`ws://localhost:${app.options.port}`)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  expect(app.connected.size).toEqual(1)
})

it('marks actions with own node ID', async () => {
  let app = createServer()
  app.type('A', { access: () => true })

  let servers: string[] = []
  app.on('add', (action, meta) => {
    servers.push(meta.server)
  })

  await app.log.add({ type: 'A' })
  await app.log.add({ type: 'A' }, { server: 'server2' })
  expect(servers).toEqual([app.nodeId, 'server2'])
})

it('marks actions with waiting status', async () => {
  let app = createServer()
  app.type('A', { access: () => true })
  app.channel('a', { access: () => true })

  let statuses: (string | undefined)[] = []
  app.on('add', (action, meta) => {
    statuses.push(meta.status)
  })

  await app.log.add({ type: 'A' })
  await app.log.add({ type: 'A' }, { status: 'processed' })
  await app.log.add({ channel: 'a', type: 'logux/subscribe' })
  expect(statuses).toEqual(['waiting', 'processed', undefined])
})

it('defines actions types', () => {
  let app = createServer()
  app.type('FOO', { access: () => true })
  expect(privateMethods(app).types.FOO).not.toBeUndefined()
})

it('does not allow to define type twice', () => {
  let app = createServer()
  app.type('FOO', { access: () => true })
  expect(() => {
    app.type('FOO', { access: () => true })
  }).toThrow(/already/)
})

it('requires access callback for type', () => {
  let app = createServer()
  expect(() => {
    // @ts-expect-error
    app.type('FOO')
  }).toThrow(/access callback/)
})

it('reports about unknown action type', async () => {
  let test = createReporter()
  await test.app.log.add({ type: 'UNKNOWN' }, { id: '1 10:uuid 0' })
  expect(test.names).toEqual(['addClean', 'unknownType', 'addClean'])
  expect(test.reports[1]).toEqual([
    'unknownType',
    {
      actionId: '1 10:uuid 0',
      type: 'UNKNOWN'
    }
  ])
})

it('ignores unknown type for processed actions', async () => {
  let test = createReporter()
  await test.app.log.add(
    { type: 'A' },
    { channels: ['a'], status: 'processed' }
  )
  expect(test.names).toEqual(['addClean'])
})

it('reports about fatal error', () => {
  let test = createReporter({ env: 'development' })

  let err = new Error('Test')
  emit(test.app, 'fatal', err)

  expect(test.reports).toEqual([['error', { err, fatal: true }]])
})

it('sends errors to clients in development', () => {
  let test = createReporter({ env: 'development' })
  test.app.connected.set('0', {
    connection: { connected: true, send: spy() },
    destroy: () => false
  } as any)

  let err = new Error('Test')
  err.stack = 'stack'
  privateMethods(err).nodeId = '10:uuid'
  emit(test.app, 'error', err)

  expect(test.reports).toEqual([['error', { err, nodeId: '10:uuid' }]])
  expect(calls(test.app.connected.get('0')?.connection.send)).toEqual([
    [['debug', 'error', 'stack']]
  ])
})

it('does not send errors in non-development mode', () => {
  let app = createServer({ env: 'production' })
  app.connected.set('0', {
    connection: { send: spy() },
    destroy: () => false
  } as any)
  emit(app, 'error', new Error('Test'))
  expect(called(app.connected.get('0')?.connection.send)).toBe(false)
})

it('processes actions', async () => {
  let test = createReporter()
  let processed: Action[] = []
  let fired: Action[] = []

  test.app.type('FOO', {
    access: () => true,
    async process(ctx, action, meta) {
      expect(meta.added).toEqual(1)
      expect(ctx.isServer).toBe(true)
      await setTimeout(25)
      processed.push(action)
    }
  })
  test.app.on('processed', (action, meta, latency) => {
    expect(typeof latency).toEqual('number')
    expect(meta.added).toEqual(1)
    fired.push(action)
  })

  await test.app.log.add({ type: 'FOO' }, { reasons: ['test'] })
  expect(fired).toEqual([])
  expect(test.app.log.entries()[0][1].status).toEqual('waiting')
  await setTimeout(30)
  expect(test.app.log.entries()[0][1].status).toEqual('processed')
  expect(processed).toEqual([{ type: 'FOO' }])
  expect(fired).toEqual([{ type: 'FOO' }])
})

it('processes regex matching action', async () => {
  let test = createReporter()
  let processed: Action[] = []
  let fired: Action[] = []

  test.app.type(/.*TODO$/, {
    access: () => true,
    async process(ctx, action, meta) {
      expect(meta.added).toEqual(1)
      expect(ctx.isServer).toBe(true)
      await setTimeout(25)
      processed.push(action)
    }
  })
  test.app.on('processed', (action, meta, latency) => {
    expect(typeof latency).toEqual('number')
    expect(meta.added).toEqual(1)
    fired.push(action)
  })

  await test.app.log.add({ type: 'ADD_TODO' }, { reasons: ['test'] })
  expect(fired).toEqual([])
  expect(test.app.log.entries()[0][1].status).toEqual('waiting')
  await setTimeout(30)
  expect(test.app.log.entries()[0][1].status).toEqual('processed')
  expect(processed).toEqual([{ type: 'ADD_TODO' }])
  expect(fired).toEqual([{ type: 'ADD_TODO' }])
})

it('has full events API', () => {
  let app = createServer()

  let events = 0
  let unbind = app.on('processed', () => {
    events += 1
  })

  emit(app, 'processed', { type: 'FOO' }, { id: '1 1:1 0' })
  emit(app, 'processed', { type: 'FOO' }, { id: '1 1:1 0' })
  unbind()
  emit(app, 'processed', { type: 'FOO' }, { id: '1 1:1 0' })

  expect(events).toEqual(2)
})

it('waits for last processing before destroy', async () => {
  let app = createServer()

  let started = 0
  let process: (() => void) | undefined

  app.type('FOO', {
    access: () => true,
    process() {
      started += 1
      return new Promise(resolve => {
        process = resolve
      })
    }
  })

  let destroyed = false
  await app.log.add({ type: 'FOO' })
  app.destroy().then(() => {
    destroyed = true
  })
  await setTimeout(1)

  expect(destroyed).toBe(false)
  expect(privateMethods(app).processing).toEqual(1)
  await app.log.add({ type: 'FOO' })

  expect(started).toEqual(1)
  if (typeof process === 'undefined') throw new Error('process is not set')
  process()
  await setTimeout(1)

  expect(destroyed).toBe(true)
})

it('reports about error during action processing', async () => {
  let test = createReporter()

  let err = new Error('Test')
  test.app.type('FOO', {
    access: () => true,
    process() {
      throw err
    }
  })

  await test.app.log.add({ type: 'FOO' }, { reasons: ['test'] })
  await setTimeout(1)

  expect(test.names).toEqual(['add', 'error', 'add'])
  expect(test.reports[1]).toEqual([
    'error',
    {
      actionId: '1 server:uuid 0',
      err
    }
  ])
  expect(test.reports[2][1].action).toEqual({
    action: { type: 'FOO' },
    id: '1 server:uuid 0',
    reason: 'error',
    type: 'logux/undo'
  })
})

it('undoes actions on client', async () => {
  let app = createServer()
  app.undo(
    { type: 'FOO' },
    {
      added: 1,
      channels: ['user/1'],
      clients: ['2:client'],
      excludeClients: ['3:client'],
      id: '1 1:client:uuid 0',
      nodes: ['2:client:uuid'],
      reasons: ['user/1/lastValue'],
      server: 'server:uuid',
      time: 1,
      users: ['3']
    },
    'magic',
    {
      one: 1
    }
  )

  expect(app.log.entries()).toEqual([
    [
      {
        action: {
          type: 'FOO'
        },
        id: '1 1:client:uuid 0',
        one: 1,
        reason: 'magic',
        type: 'logux/undo'
      },
      {
        added: 1,
        channels: ['user/1'],
        clients: ['2:client', '1:client'],
        excludeClients: ['3:client'],
        id: '1 server:uuid 0',
        nodes: ['2:client:uuid'],
        reasons: ['user/1/lastValue'],
        server: 'server:uuid',
        status: 'processed',
        subprotocol: '0.0.0',
        time: 1,
        users: ['3']
      }
    ]
  ])
})

it('adds current subprotocol to meta', async () => {
  let app = createServer({ subprotocol: '1.0.0' })
  app.type('A', { access: () => true })
  await app.log.add({ type: 'A' }, { reasons: ['test'] })
  expect(app.log.entries()[0][1].subprotocol).toEqual('1.0.0')
})

it('adds current subprotocol only to own actions', async () => {
  let app = createServer({ subprotocol: '1.0.0' })
  app.type('A', { access: () => true })
  await app.log.add({ type: 'A' }, { id: '1 0:other 0', reasons: ['test'] })
  expect(app.log.entries()[0][1].subprotocol).toBeUndefined()
})

it('allows to override subprotocol in meta', async () => {
  let app = createServer({ subprotocol: '1.0.0' })
  app.type('A', { access: () => true })
  await app.log.add({ type: 'A' }, { reasons: ['test'], subprotocol: '0.1.0' })
  expect(app.log.entries()[0][1].subprotocol).toEqual('0.1.0')
})

it('checks channel definition', () => {
  let app = createServer()

  expect(() => {
    // @ts-expect-error
    app.channel('foo/:id')
  }).toThrow('Channel foo/:id must have access callback')

  expect(() => {
    // @ts-expect-error
    app.channel(/^foo:/, { load: true })
  }).toThrow('Channel /^foo:/ must have access callback')
})

it('reports about wrong channel name', async () => {
  let test = createReporter({ env: 'development' })
  test.app.channel('foo', { access: () => true })
  let client: any = {
    connection: { send: spy() },
    node: { onAdd() {} }
  }
  test.app.nodeIds.set('10:uuid', client)
  test.app.clientIds.set('10:uuid', client)
  await test.app.log.add({ type: 'logux/subscribe' }, { id: '1 10:uuid 0' })
  expect(test.names).toEqual(['addClean', 'wrongChannel', 'addClean'])
  expect(test.reports[1][1]).toEqual({
    actionId: '1 10:uuid 0',
    channel: undefined
  })
  expect(test.reports[2][1].action).toEqual({
    action: { type: 'logux/subscribe' },
    id: '1 10:uuid 0',
    reason: 'wrongChannel',
    type: 'logux/undo'
  })
  expect(calls(client.connection.send)).toEqual([
    [['debug', 'error', 'Wrong channel name undefined']]
  ])
  await test.app.log.add({ type: 'logux/unsubscribe' })

  expect(test.reports[4]).toEqual([
    'wrongChannel',
    {
      actionId: '2 server:uuid 0',
      channel: undefined
    }
  ])
  await test.app.log.add({ channel: 'unknown', type: 'logux/subscribe' })

  expect(test.reports[7]).toEqual([
    'wrongChannel',
    {
      actionId: '4 server:uuid 0',
      channel: 'unknown'
    }
  ])
})

it('checks custom channel name subscriber', () => {
  let app = createServer()

  expect(() => {
    // @ts-expect-error
    app.otherChannel()
  }).toThrow('Unknown channel must have access callback')

  app.otherChannel({ access: () => true })
  expect(() => {
    app.otherChannel({ access: () => true })
  }).toThrow('Callbacks for unknown channel are already defined')
})

it('allows to have custom channel name check', async () => {
  let test = createReporter()
  let channels: string[] = []
  test.app.otherChannel({
    access(ctx, action, meta) {
      channels.push(ctx.params[0])
      test.app.wrongChannel(action, meta)
      return false
    }
  })
  let client: any = {
    connection: { send() {} },
    node: { onAdd() {} }
  }
  test.app.nodeIds.set('10:uuid', client)
  test.app.clientIds.set('10:uuid', client)
  await test.app.log.add({ channel: 'foo', type: 'logux/subscribe' })
  expect(channels).toEqual(['foo'])
  expect(test.names).toEqual(['addClean', 'wrongChannel', 'addClean'])
})

it('ignores subscription for other servers', async () => {
  let test = createReporter()
  let action = { type: 'logux/subscribe' }
  await test.app.log.add(action, { server: 'server:other' })
  expect(test.names).toEqual(['addClean'])
})

it('checks channel access', async () => {
  let test = createReporter()
  let client: any = {
    node: { onAdd: () => false, remoteSubprotocol: '0.0.0' }
  }
  test.app.nodeIds.set('10:uuid', client)
  test.app.clientIds.set('10:uuid', client)

  let finalled = 0

  test.app.channel(/^user\/(\d+)$/, {
    async access(ctx) {
      expect(ctx.params[1]).toEqual('10')
      return false
    },
    finally() {
      finalled += 1
    }
  })

  await test.app.log.add(
    { channel: 'user/10', type: 'logux/subscribe' },
    { id: '1 10:uuid 0' }
  )
  await setTimeout(1)

  expect(test.names).toEqual(['addClean', 'denied', 'addClean'])
  expect(test.reports[1][1]).toEqual({ actionId: '1 10:uuid 0' })
  expect(test.reports[2][1].action).toEqual({
    action: { channel: 'user/10', type: 'logux/subscribe' },
    id: '1 10:uuid 0',
    reason: 'denied',
    type: 'logux/undo'
  })
  expect(test.app.subscribers).toEqual({})
  expect(finalled).toEqual(1)
})

it('reports about errors during channel authorization', async () => {
  let test = createReporter()
  let client: any = {
    node: { onAdd: () => false, remoteSubprotocol: '0.0.0' }
  }
  test.app.nodeIds.set('10:uuid', client)
  test.app.clientIds.set('10:uuid', client)

  let err = new Error()
  test.app.channel(/^user\/(\d+)$/, {
    access() {
      throw err
    }
  })

  await test.app.log.add(
    { channel: 'user/10', type: 'logux/subscribe' },
    { id: '1 10:uuid 0' }
  )
  await Promise.resolve()
  await Promise.resolve()

  expect(test.names).toEqual(['addClean', 'error', 'addClean'])
  expect(test.reports[1][1]).toEqual({ actionId: '1 10:uuid 0', err })
  expect(test.reports[2][1].action).toEqual({
    action: { channel: 'user/10', type: 'logux/subscribe' },
    id: '1 10:uuid 0',
    reason: 'error',
    type: 'logux/undo'
  })
  expect(test.app.subscribers).toEqual({})
})

it('subscribes clients', async () => {
  let test = createReporter()
  let client: any = {
    node: { onAdd: () => false, remoteSubprotocol: '0.0.0' }
  }
  test.app.nodeIds.set('10:a:uuid', client)
  test.app.clientIds.set('10:a', client)

  let userSubsriptions = 0
  test.app.channel<{ id: string }>('user/:id', {
    access(ctx, action, meta) {
      expect(ctx.params.id).toEqual('10')
      expect(action.channel).toEqual('user/10')
      expect(meta.id).toEqual('1 10:a:uuid 0')
      expect(ctx.nodeId).toEqual('10:a:uuid')
      userSubsriptions += 1
      return true
    }
  })

  let filter = (): boolean => false
  test.app.channel('posts', {
    access() {
      return true
    },
    async filter() {
      return filter
    }
  })

  let events = 0
  test.app.on('subscribed', (action, meta, latency) => {
    expect(action.type).toEqual('logux/subscribe')
    expect(meta.id).toContain('10:a:uuid')
    expect(latency).toBeCloseTo(25, -2)
    events += 1
  })

  await test.app.log.add(
    { channel: 'user/10', type: 'logux/subscribe' },
    { id: '1 10:a:uuid 0' }
  )
  await setTimeout(1)
  expect(events).toEqual(1)
  expect(userSubsriptions).toEqual(1)
  expect(test.names).toEqual(['addClean', 'subscribed', 'addClean'])
  expect(test.reports[1][1]).toEqual({
    actionId: '1 10:a:uuid 0',
    channel: 'user/10'
  })
  expect(test.reports[2][1].action).toEqual({
    id: '1 10:a:uuid 0',
    type: 'logux/processed'
  })
  expect(test.reports[2][1].meta.clients).toEqual(['10:a'])
  expect(test.reports[2][1].meta.status).toEqual('processed')
  expect(test.app.subscribers).toEqual({
    'user/10': {
      '10:a:uuid': { filters: { '{}': true } }
    }
  })
  await test.app.log.add(
    { channel: 'posts', type: 'logux/subscribe' },
    { id: '2 10:a:uuid 0' }
  )
  await setTimeout(1)

  expect(events).toEqual(2)
  expect(test.app.subscribers).toEqual({
    'posts': {
      '10:a:uuid': { filters: { '{}': filter } }
    },
    'user/10': {
      '10:a:uuid': { filters: { '{}': true } }
    }
  })
  await test.app.log.add(
    { channel: 'user/10', type: 'logux/unsubscribe' },
    { id: '3 10:a:uuid 0' }
  )

  expect(test.names).toEqual([
    'addClean',
    'subscribed',
    'addClean',
    'addClean',
    'subscribed',
    'addClean',
    'addClean',
    'unsubscribed',
    'addClean'
  ])
  expect(test.reports[7][1]).toEqual({
    actionId: '3 10:a:uuid 0',
    channel: 'user/10'
  })
  expect(test.reports[8][1].action).toEqual({
    id: '3 10:a:uuid 0',
    type: 'logux/processed'
  })
  expect(test.app.subscribers).toEqual({
    posts: {
      '10:a:uuid': { filters: { '{}': filter } }
    }
  })
})

it('subscribes clients with multiple filters', async () => {
  let test = createReporter()
  let client: any = {
    node: { onAdd: () => false, remoteSubprotocol: '0.0.0' }
  }
  test.app.nodeIds.set('10:a:uuid', client)
  test.app.clientIds.set('10:a', client)

  let filter = (): boolean => false
  test.app.channel('posts', {
    access() {
      return true
    },
    async filter() {
      return filter
    }
  })

  await test.app.log.add(
    { channel: 'posts', type: 'logux/subscribe' },
    { id: '1 10:a:uuid 0' }
  )
  await test.app.log.add(
    { channel: 'posts', filter: { category: 'a' }, type: 'logux/subscribe' },
    { id: '1 10:a:uuid 0' }
  )
  await test.app.log.add(
    { channel: 'posts', filter: { category: 'b' }, type: 'logux/subscribe' },
    { id: '1 10:a:uuid 0' }
  )
  await setTimeout(1)
  expect(test.app.subscribers).toEqual({
    posts: {
      '10:a:uuid': {
        filters: {
          '{"category":"a"}': filter,
          '{"category":"b"}': filter,
          '{}': filter
        }
      }
    }
  })

  await test.app.log.add(
    { channel: 'posts', type: 'logux/unsubscribe' },
    { id: '2 10:a:uuid 0' }
  )
  await test.app.log.add(
    { channel: 'posts', filter: { category: 'b' }, type: 'logux/unsubscribe' },
    { id: '2 10:a:uuid 0' }
  )
  await setTimeout(1)
  expect(test.app.subscribers).toEqual({
    posts: {
      '10:a:uuid': {
        filters: { '{"category":"a"}': filter }
      }
    }
  })
})

it('cancels subscriptions on disconnect', async () => {
  let app = createServer()
  let client: any = {
    node: { onAdd: () => false, remoteSubprotocol: '0.0.0' }
  }
  app.nodeIds.set('10:uuid', client)
  app.clientIds.set('10:uuid', client)

  let cancels = 0
  app.on('subscriptionCancelled', () => {
    cancels += 1
  })

  app.channel('test', {
    access() {
      app.clientIds.delete('10:uuid')
      app.nodeIds.delete('10:uuid')
      return true
    },
    filter() {
      throw new Error('no calls')
    },
    load() {
      throw new Error('no calls')
    }
  })

  await app.log.add(
    { channel: 'test', type: 'logux/subscribe' },
    { id: '1 10:uuid 0' }
  )
  await setTimeout(10)

  expect(cancels).toEqual(1)
})

it('reports about errors during channel initialization', async () => {
  let test = createReporter()
  let client: any = {
    node: { onAdd: () => false, remoteSubprotocol: '0.0.0' }
  }
  test.app.nodeIds.set('10:uuid', client)
  test.app.clientIds.set('10:uuid', client)

  let err = new Error()
  test.app.channel(/^user\/(\d+)$/, {
    access: () => true,
    load() {
      throw err
    }
  })

  await test.app.log.add(
    { channel: 'user/10', type: 'logux/subscribe' },
    { id: '1 10:uuid 0' }
  )
  await setTimeout(1)

  expect(test.names).toEqual([
    'addClean',
    'subscribed',
    'error',
    'addClean',
    'unsubscribed'
  ])
  expect(test.reports[2][1]).toEqual({ actionId: '1 10:uuid 0', err })
  expect(test.reports[3][1].action).toEqual({
    action: { channel: 'user/10', type: 'logux/subscribe' },
    id: '1 10:uuid 0',
    reason: 'error',
    type: 'logux/undo'
  })
  expect(test.app.subscribers).toEqual({})
})

it('loads initial actions during subscription', async () => {
  let test = createReporter({ time: new TestTime() })
  let client: any = {
    node: { onAdd: () => false, remoteSubprotocol: '0.0.0' }
  }
  test.app.nodeIds.set('10:uuid', client)
  test.app.clientIds.set('10:uuid', client)

  test.app.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  let userLoaded = 0
  let initializating: (() => void) | undefined
  test.app.channel<{ id: string }>('user/:id', {
    access: () => true,
    load(ctx, action, meta) {
      expect(ctx.params.id).toEqual('10')
      expect(action.channel).toEqual('user/10')
      expect(meta.id).toEqual('1 10:uuid 0')
      expect(ctx.nodeId).toEqual('10:uuid')
      userLoaded += 1
      return new Promise(resolve => {
        initializating = resolve
      })
    }
  })

  await test.app.log.add(
    { channel: 'user/10', type: 'logux/subscribe' },
    { id: '1 10:uuid 0' }
  )
  await setTimeout(1)
  expect(userLoaded).toEqual(1)
  expect(test.app.subscribers).toEqual({
    'user/10': {
      '10:uuid': { filters: { '{}': true } }
    }
  })
  expect(test.app.log.actions()).toEqual([
    { channel: 'user/10', type: 'logux/subscribe' }
  ])
  if (typeof initializating === 'undefined') {
    throw new Error('callback is not set')
  }
  initializating()
  await setTimeout(1)

  expect(test.app.log.actions()).toEqual([
    { channel: 'user/10', type: 'logux/subscribe' },
    { id: '1 10:uuid 0', type: 'logux/processed' }
  ])
})

it('calls unsubscribe() channel callback with logux/unsubscribe', async () => {
  let test = createReporter({})
  let client: any = {
    node: {
      onAdd: () => false,
      remoteHeaders: { preservedHeaders: true },
      remoteSubprotocol: '0.0.0'
    }
  }
  let nodeId = '10:uuid'
  let clientId = '10:uuid'
  let userId = '10'
  test.app.nodeIds.set(nodeId, client)
  test.app.clientIds.set(clientId, client)
  test.app.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })
  let unsubscribeCallback = spy()
  test.app.channel<{ id: string }, { preservedData?: boolean }>('user/:id', {
    access(ctx) {
      ctx.data.preservedData = true
      return true
    },
    unsubscribe: unsubscribeCallback
  })

  await test.app.log.add(
    { channel: 'user/10', type: 'logux/subscribe' },
    { id: `1 ${nodeId}` }
  )
  expect(Object.keys(test.app.subscribers)).toHaveLength(1)

  await test.app.log.add(
    { channel: 'user/10', type: 'logux/unsubscribe' },
    { id: `2 ${nodeId}` }
  )
  expect(Object.keys(test.app.subscribers)).toHaveLength(0)

  expect(test.app.log.actions()).toEqual([
    { channel: 'user/10', type: 'logux/subscribe' },
    { id: `1 ${nodeId}`, type: 'logux/processed' },
    { channel: 'user/10', type: 'logux/unsubscribe' },
    { id: `2 ${nodeId}`, type: 'logux/processed' }
  ])
  expect(unsubscribeCallback.calls).toEqual([
    [
      expect.objectContaining({
        clientId,
        data: { preservedData: true },
        headers: { preservedHeaders: true },
        nodeId,
        params: { id: '10' },
        subprotocol: '0.0.0',
        userId
      }),
      expect.objectContaining({
        channel: 'user/10',
        type: 'logux/unsubscribe'
      }),
      expect.objectContaining({
        status: 'processed'
      })
    ]
  ])
})

it('does not need type definition for own actions', async () => {
  let test = createReporter()
  await test.app.log.add({ type: 'unknown' }, { users: ['10'] })
  expect(test.names).toEqual(['addClean'])
  expect(test.reports[0][1].action.type).toEqual('unknown')
  expect(test.reports[0][1].meta.status).toEqual('processed')
})

it('checks callbacks in unknown type handler', () => {
  let app = createServer()

  expect(() => {
    // @ts-expect-error
    app.otherType({ process: () => {} })
  }).toThrow('Unknown type must have access callback')

  app.otherType({ access: () => true })
  expect(() => {
    app.otherType({ access: () => true })
  }).toThrow('Callbacks for unknown types are already defined')
})

it('reports about useless actions', async () => {
  let test = createReporter()
  test.app.type('known', {
    access: () => true,
    process: () => {}
  })
  test.app.channel('a', { access: () => true })
  test.app.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })
  await test.app.log.add({ type: 'unknown' }, { status: 'processed' })
  await test.app.log.add({ type: 'known' })
  await test.app.log.add({ channel: 'a', type: 'logux/subscribe' })
  await test.app.log.add({ type: 'known' }, { channels: ['a'] })
  await test.app.log.add({ type: 'known' }, { users: ['10'] })
  await test.app.log.add({ type: 'known' }, { clients: ['10:client'] })
  await test.app.log.add({ type: 'known' }, { nodes: ['10:client:uuid'] })
  expect(test.names).toEqual([
    'add',
    'useless',
    'add',
    'add',
    'add',
    'add',
    'add',
    'add'
  ])
})

it('has shortcuts for resend arrays', async () => {
  let test = createReporter()
  test.app.type('A', {
    access: () => true,
    process: () => {}
  })
  test.app.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })
  await test.app.log.add(
    { type: 'A' },
    { channel: 'a', client: '1:1', node: '1:1:1', user: '1' }
  )
  expect(test.app.log.entries()).toEqual([
    [
      { type: 'A' },
      {
        added: 1,
        channels: ['a'],
        clients: ['1:1'],
        id: '1 server:uuid 0',
        nodes: ['1:1:1'],
        reasons: ['test'],
        server: 'server:uuid',
        status: 'waiting',
        subprotocol: '0.0.0',
        time: 1,
        users: ['1']
      }
    ]
  ])
  await setTimeout(10)
  expect(test.app.log.entries()).toEqual([
    [
      { type: 'A' },
      {
        added: 1,
        channels: ['a'],
        clients: ['1:1'],
        id: '1 server:uuid 0',
        nodes: ['1:1:1'],
        reasons: ['test'],
        server: 'server:uuid',
        status: 'processed',
        subprotocol: '0.0.0',
        time: 1,
        users: ['1']
      }
    ]
  ])
})

it('tracks action processing on add', async () => {
  let error = new Error('test')
  let app = createServer()
  app.type('FOO', {
    access: () => false,
    resend: () => ({ channels: ['foo'] })
  })
  app.type('ERROR', {
    access: () => false,
    process() {
      throw error
    }
  })

  let meta = await app.process({ type: 'FOO' }, { a: 1 })
  expect(meta.a).toEqual(1)
  expect(meta.channels).toEqual(['foo'])

  let err
  try {
    await app.process({ type: 'ERROR' })
  } catch (e) {
    err = e
  }
  expect(err).toBe(error)
})

it('has shortcut API for action creators', async () => {
  type ActionA = { aValue: string; type: 'A' }
  let createA = defineAction<ActionA>('A')

  let processed: string[] = []
  let app = createServer()
  app.type(createA, {
    access: () => true,
    process(ctx, action) {
      processed.push(action.aValue)
    }
  })

  await app.process(createA({ aValue: 'test' }))
  expect(processed).toEqual(['test'])
})

it('has alias to root from file URL', () => {
  let app = new BaseServer({
    fileUrl: import.meta.url,
    subprotocol: '1.0.0',
    supports: '1.0.0'
  })
  expect(app.options.root).toEqual(join(fileURLToPath(import.meta.url), '..'))
})

it('has custom logger', () => {
  let app = new BaseServer({
    fileUrl: import.meta.url,
    subprotocol: '1.0.0',
    supports: '1.0.0'
  })
  spyOn(console, 'warn', () => {})
  app.logger.warn({ test: 1 }, 'test')
  expect(calls(console.warn)).toEqual([[{ test: 1 }, 'test']])
})

it('subscribes clients manually', async () => {
  let app = new BaseServer({
    fileUrl: import.meta.url,
    subprotocol: '1.0.0',
    supports: '1.0.0'
  })
  let actions: Action[] = []
  app.log.on('add', (action, meta) => {
    expect(meta.nodes).toEqual(['test:1:1'])
    actions.push(action)
  })

  app.subscribe('test:1:1', 'users/10')
  await setTimeout(10)
  expect(app.subscribers).toEqual({
    'users/10': {
      'test:1:1': { filters: { '{}': true } }
    }
  })
  expect(actions).toEqual([{ channel: 'users/10', type: 'logux/subscribed' }])

  app.subscribe('test:1:1', 'users/10')
  await setTimeout(10)
  expect(actions).toEqual([{ channel: 'users/10', type: 'logux/subscribed' }])
})

it('processes action with accessAndProcess callback', async () => {
  let test = createReporter()
  let accessAndProcess = spy()
  test.app.type('A', {
    accessAndProcess
  })
  await test.app.process({ type: 'A' })
  expect(accessAndProcess.callCount).toEqual(1)
})
