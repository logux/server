let { MemoryStore, TestTime, Log } = require('@logux/core')
let WebSocket = require('ws')
let delay = require('nanodelay')
let http = require('http')

let BaseServer = require('../base-server')
let pkg = require('../package.json')

const DEFAULT_OPTIONS = {
  subprotocol: '0.0.0',
  supports: '0.x'
}

let lastPort = 9111
function createServer (options = { }) {
  for (let i in DEFAULT_OPTIONS) {
    if (typeof options[i] === 'undefined') {
      options[i] = DEFAULT_OPTIONS[i]
    }
  }
  if (typeof options.time === 'undefined') {
    options.time = new TestTime()
    options.id = 'uuid'
  }
  if (typeof options.port === 'undefined') {
    lastPort += 1
    options.port = lastPort
  }
  if (typeof options.controlPort === 'undefined') {
    lastPort += 1
    options.controlPort = lastPort
  }

  let created = new BaseServer(options)
  created.auth(() => true)

  return created
}

let app, server

function createReporter (opts) {
  let result = { }
  result.names = []
  result.reports = []

  opts = opts || { }
  opts.reporter = (name, details) => {
    result.names.push(name)
    result.reports.push([name, details])
  }

  app = createServer(opts)
  result.app = app
  return result
}

let originEnv = process.env.NODE_ENV

afterEach(async () => {
  process.env.NODE_ENV = originEnv
  if (app) {
    await app.destroy()
    app = undefined
  }
  if (server) server.close()
})

it('saves server options', () => {
  app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x'
  })
  expect(app.options.supports).toEqual('0.x')
})

it('generates node ID', () => {
  app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x'
  })
  expect(app.nodeId).toMatch(/server:\w+/)
})

it('throws on missed subprotocol', () => {
  expect(() => {
    new BaseServer({ })
  }).toThrow(/Missed `subprotocol` option/)
})

it('throws on missed supported subprotocols', () => {
  expect(() => {
    new BaseServer({ subprotocol: '0.0.0' })
  }).toThrow(/Missed `supports` option/)
})

it('sets development environment by default', () => {
  delete process.env.NODE_ENV
  app = new BaseServer(DEFAULT_OPTIONS)
  expect(app.env).toEqual('development')
})

it('takes environment from NODE_ENV', () => {
  process.env.NODE_ENV = 'production'
  app = new BaseServer(DEFAULT_OPTIONS)
  expect(app.env).toEqual('production')
})

it('sets environment from user', () => {
  app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    env: 'production'
  })
  expect(app.env).toEqual('production')
})

it('uses cwd as default root', () => {
  app = new BaseServer(DEFAULT_OPTIONS)
  expect(app.options.root).toEqual(process.cwd())
})

it('uses user root', () => {
  app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    root: '/a'
  })
  expect(app.options.root).toEqual('/a')
})

it('creates log with default store', () => {
  app = new BaseServer(DEFAULT_OPTIONS)
  expect(app.log instanceof Log).toBe(true)
  expect(app.log.store instanceof MemoryStore).toBe(true)
})

it('creates log with custom store', () => {
  let store = new MemoryStore()
  app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    store
  })
  expect(app.log.store).toBe(store)
})

it('uses test time and ID', () => {
  let store = new MemoryStore()
  app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    store,
    time: new TestTime(),
    id: 'uuid'
  })
  expect(app.log.store).toEqual(store)
  expect(app.log.generateId()).toEqual('1 server:uuid 0')
})

it('destroys application without runned server', async () => {
  app = new BaseServer(DEFAULT_OPTIONS)
  await app.destroy()
  app.destroy()
})

it('throws without authenticator', () => {
  expect.assertions(1)
  app = new BaseServer(DEFAULT_OPTIONS)
  return app.listen().catch(e => {
    expect(e.message).toMatch(/authentication/)
  })
})

it('sets default ports and hosts', () => {
  app = createServer()
  expect(app.options.port).toEqual(31337)
  expect(app.options.host).toEqual('127.0.0.1')
  expect(app.options.controlPort).toEqual(31338)
  expect(app.options.controlHost).toEqual('127.0.0.1')
})

it('uses user port', () => {
  app = createServer({ port: 1337 })
  expect(app.options.port).toEqual(1337)
})

it('throws a error on key without certificate', () => {
  expect(() => {
    app = createServer({ key: '-----BEGIN' })
  }).toThrow(/set `cert` option/)
})

it('throws a error on certificate without key', () => {
  expect(() => {
    app = createServer({ cert: '-----BEGIN' })
  }).toThrow(/set `key` option/)
})

it('reporters on start listening', async () => {
  let test = createReporter({
    controlPassword: 'secret',
    backend: 'http://127.0.0.1:3000/logux',
    redis: '//localhost'
  })

  test.app.listenNotes.prometheus = 'http://127.0.0.1:31338/prometheus'

  let promise = test.app.listen()
  expect(test.reports).toEqual([])

  await promise
  expect(test.reports).toEqual([
    ['listen', {
      controlPassword: 'secret',
      controlHost: '127.0.0.1',
      controlPort: 31338,
      loguxServer: pkg.version,
      environment: 'test',
      subprotocol: '0.0.0',
      supports: '0.x',
      backend: 'http://127.0.0.1:3000/logux',
      nodeId: 'server:uuid',
      server: false,
      redis: '//localhost',
      notes: {
        prometheus: 'http://127.0.0.1:31338/prometheus'
      },
      cert: false,
      host: '127.0.0.1',
      port: test.app.options.port
    }]
  ])
})

it('reporters on log events', () => {
  let test = createReporter()
  test.app.type('A', { access: () => true })
  test.app.log.add({ type: 'A' })
  expect(test.reports).toEqual([
    ['add', {
      action: {
        type: 'A'
      },
      meta: {
        id: '1 server:uuid 0',
        reasons: [],
        status: 'waiting',
        server: 'server:uuid',
        subprotocol: '0.0.0',
        time: 1
      }
    }],
    ['clean', {
      actionId: '1 server:uuid 0'
    }]
  ])
})

it('reporters on destroying', () => {
  let test = createReporter()
  let promise = test.app.destroy()
  expect(test.reports).toEqual([['destroy', undefined]])
  return promise
})

it('creates a client on connection', async () => {
  app = createServer()
  await app.listen()
  let ws = new WebSocket(`ws://127.0.0.1:${ app.options.port }`)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  expect(Object.keys(app.connected)).toHaveLength(1)
  expect(app.connected[1].remoteAddress).toEqual('127.0.0.1')
})

it('creates a client manually', () => {
  app = createServer()
  app.addClient({
    on: () => {
      return () => true
    },
    ws: {
      _socket: {
        remoteAddress: '127.0.0.1'
      }
    }
  })
  expect(Object.keys(app.connected)).toHaveLength(1)
  expect(app.connected[1].remoteAddress).toEqual('127.0.0.1')
})

it('sends debug message to clients on runtimeError', () => {
  app = createServer()
  app.connected[1] = {
    connection: {
      connected: true,
      send: jest.fn()
    },
    destroy: () => false
  }
  app.connected[2] = {
    connection: {
      connected: false,
      send: jest.fn()
    },
    destroy: () => false
  }
  app.connected[3] = {
    connection: {
      connected: true,
      send: () => { throw new Error() }
    },
    destroy: () => false
  }

  let error = new Error('Test Error')
  error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`

  app.debugError(error)
  expect(app.connected[1].connection.send).toHaveBeenCalledWith([
    'debug',
    'error',
    'Error: Test Error\n' +
    'fake stacktrace'
  ])
  expect(app.connected[2].connection.send).not.toHaveBeenCalled()
})

it('disconnects client on destroy', () => {
  app = createServer()
  app.connected[1] = { destroy: jest.fn() }
  app.destroy()
  expect(app.connected[1].destroy).toHaveBeenCalledTimes(1)
})

it('accepts custom HTTP server', async () => {
  server = http.createServer()
  app = createServer({ server })

  await new Promise(resolve => {
    server.listen(app.options.port, resolve)
  })
  await app.listen()

  let ws = new WebSocket(`ws://localhost:${ app.options.port }`)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  expect(Object.keys(app.connected)).toHaveLength(1)
})

it('marks actions with own node ID', async () => {
  app = createServer()
  app.type('A', { access: () => true })

  let servers = []
  app.on('add', (action, meta) => {
    servers.push(meta.server)
  })

  await app.log.add({ type: 'A' })
  await app.log.add({ type: 'A' }, { server: 'server2' })
  expect(servers).toEqual([app.nodeId, 'server2'])
})

it('marks actions with waiting status', async () => {
  app = createServer()
  app.type('A', { access: () => true })
  app.channel('a', { access: () => true })

  let statuses = []
  app.on('add', (action, meta) => {
    statuses.push(meta.status)
  })

  await app.log.add({ type: 'A' })
  await app.log.add({ type: 'A' }, { status: 'processed' })
  await app.log.add({ type: 'logux/subscribe', channel: 'a' })
  expect(statuses).toEqual(['waiting', 'processed', undefined])
})

it('defines actions types', () => {
  app = createServer()
  app.type('FOO', { access: () => true })
  expect(app.types.FOO).not.toBeUndefined()
})

it('does not allow to define type twice', () => {
  app = createServer()
  app.type('FOO', { access: () => true })
  expect(() => {
    app.type('FOO', { access: () => true })
  }).toThrow(/already/)
})

it('requires access callback for type', () => {
  app = createServer()
  expect(() => {
    app.type('FOO')
  }).toThrow(/access callback/)
})

it('reports about unknown action type', async () => {
  let test = createReporter()
  await test.app.log.add(
    { type: 'UNKNOWN' }, { id: '1 10:uuid 0' }
  )
  expect(test.names).toEqual(['add', 'unknownType', 'add', 'clean', 'clean'])
  expect(test.reports[1]).toEqual(['unknownType', {
    actionId: '1 10:uuid 0',
    type: 'UNKNOWN'
  }])
})

it('ignores unknown type for processed actions', async () => {
  let test = createReporter()
  await test.app.log.add(
    { type: 'A' }, { status: 'processed', channels: ['a'] }
  )
  expect(test.names).toEqual(['add', 'clean'])
})

it('reports about fatal error', () => {
  let test = createReporter({ env: 'development' })

  let err = new Error('Test')
  test.app.emitter.emit('fatal', err)

  expect(test.reports).toEqual([
    ['error', { err, fatal: true }]
  ])
})

it('sends errors to clients in development', () => {
  let test = createReporter({ env: 'development' })
  test.app.connected[0] = {
    connection: { connected: true, send: jest.fn() },
    destroy: () => false
  }

  let err = new Error('Test')
  err.stack = 'stack'
  err.nodeId = '10:uuid'
  test.app.emitter.emit('error', err)

  expect(test.reports).toEqual([['error', { err, nodeId: '10:uuid' }]])
  expect(test.app.connected[0].connection.send).toHaveBeenCalledWith(
    ['debug', 'error', 'stack']
  )
})

it('does not send errors in non-development mode', () => {
  app = createServer({ env: 'production' })
  app.connected[0] = {
    connection: { send: jest.fn() },
    destroy: () => false
  }
  app.emitter.emit('error', new Error('Test'))
  expect(app.connected[0].connection.send).not.toHaveBeenCalled()
})

it('processes actions', async () => {
  let test = createReporter()
  let processed = []
  let fired = []

  test.app.type('FOO', {
    access: () => true,
    async process (ctx, action, meta) {
      expect(meta.added).toEqual(1)
      expect(ctx.isServer).toBe(true)
      await delay(25)
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
  await delay(30)
  expect(test.app.log.entries()[0][1].status).toEqual('processed')
  expect(processed).toEqual([{ type: 'FOO' }])
  expect(fired).toEqual([{ type: 'FOO' }])
  expect(test.names).toEqual(['add', 'processed'])
  expect(Object.keys(test.reports[1][1])).toEqual(['actionId', 'latency'])
  expect(test.reports[1][1].actionId).toEqual('1 server:uuid 0')
  expect(test.reports[1][1].latency).toBeCloseTo(25, -2)
})

it('has full events API', () => {
  app = createServer()

  let events = 0
  let unbind = app.on('processed', () => {
    events += 1
  })

  app.emitter.emit('processed')
  app.emitter.emit('processed')
  unbind()
  app.emitter.emit('processed')

  expect(events).toEqual(2)
})

it('waits for last processing before destroy', async () => {
  app = createServer()

  let started = 0
  let process

  app.type('FOO', {
    access: () => true,
    process () {
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
  await delay(1)

  expect(destroyed).toBe(false)
  expect(app.processing).toEqual(1)
  await app.log.add({ type: 'FOO' })

  expect(started).toEqual(1)
  process()
  await delay(1)

  expect(destroyed).toBe(true)
})

it('reports about error during action processing', async () => {
  let test = createReporter()

  let err = new Error('Test')
  app.type('FOO', {
    access: () => true,
    process () {
      throw err
    }
  })

  await app.log.add({ type: 'FOO' }, { reasons: ['test'] })
  await delay(1)

  expect(test.names).toEqual(['add', 'error', 'add'])
  expect(test.reports[1]).toEqual(['error', {
    actionId: '1 server:uuid 0',
    err
  }])
  expect(test.reports[2][1].action).toEqual({
    type: 'logux/undo', reason: 'error', id: '1 server:uuid 0'
  })
})

it('undoes actions on client', async () => {
  app = createServer()
  app.undo({
    id: '1 1:client:uuid 0',
    users: ['3'],
    nodes: ['2:client:uuid'],
    clients: ['2:client'],
    reasons: ['user/1/lastValue'],
    channels: ['user/1']
  }, 'magic', {
    one: 1
  })

  expect(app.log.entries()).toEqual([
    [
      {
        id: '1 1:client:uuid 0',
        one: 1,
        type: 'logux/undo',
        reason: 'magic'
      },
      {
        id: '1 server:uuid 0',
        time: 1,
        added: 1,
        users: ['3'],
        nodes: ['2:client:uuid'],
        server: 'server:uuid',
        status: 'processed',
        clients: ['1:client', '2:client'],
        reasons: ['user/1/lastValue'],
        channels: ['user/1'],
        subprotocol: '0.0.0'
      }
    ]
  ])
})

it('adds current subprotocol to meta', async () => {
  app = createServer({ subprotocol: '1.0.0' })
  app.type('A', { access: () => true })
  await app.log.add({ type: 'A' }, { reasons: ['test'] })
  expect(app.log.entries()[0][1].subprotocol).toEqual('1.0.0')
})

it('adds current subprotocol only to own actions', async () => {
  app = createServer({ subprotocol: '1.0.0' })
  app.type('A', { access: () => true })
  await app.log.add(
    { type: 'A' },
    { id: '1 0:other 0', reasons: ['test'] }
  )
  expect(app.log.entries()[0][1].subprotocol).toBeUndefined()
})

it('allows to override subprotocol in meta', async () => {
  app = createServer({ subprotocol: '1.0.0' })
  app.type('A', { access: () => true })
  await app.log.add(
    { type: 'A' },
    { subprotocol: '0.1.0', reasons: ['test'] }
  )
  expect(app.log.entries()[0][1].subprotocol).toEqual('0.1.0')
})

it('checks channel definition', () => {
  app = createServer()

  expect(() => {
    app.channel('foo/:id')
  }).toThrow('Channel foo/:id must have access callback')

  expect(() => {
    app.channel(/^foo:/, { init: true })
  }).toThrow('Channel /^foo:/ must have access callback')
})

it('reports about wrong channel name', async () => {
  let test = createReporter({ env: 'development' })
  test.app.channel('foo', { access: () => true })
  test.app.nodeIds['10:uuid'] = {
    connection: { send: jest.fn() },
    node: { onAdd () { } }
  }
  test.app.clientIds['10:uuid'] = test.app.nodeIds['10:uuid']
  await test.app.log.add(
    { type: 'logux/subscribe' }, { id: '1 10:uuid 0' }
  )
  expect(test.names).toEqual([
    'add', 'wrongChannel', 'add', 'clean', 'clean'
  ])
  expect(test.reports[1][1]).toEqual({
    actionId: '1 10:uuid 0', channel: undefined
  })
  expect(test.reports[2][1].action).toEqual({
    id: '1 10:uuid 0', reason: 'error', type: 'logux/undo'
  })
  expect(test.app.nodeIds['10:uuid'].connection.send).toHaveBeenCalledWith([
    'debug', 'error', 'Wrong channel name undefined'
  ])
  await test.app.log.add({ type: 'logux/unsubscribe' })

  expect(test.reports[6]).toEqual(['wrongChannel', {
    actionId: '2 server:uuid 0', channel: undefined
  }])
  await test.app.log.add({ type: 'logux/subscribe', channel: 'unknown' })

  expect(test.reports[11]).toEqual(['wrongChannel', {
    actionId: '4 server:uuid 0', channel: 'unknown'
  }])
})

it('checks custom channel name subscriber', () => {
  app = createServer()

  expect(() => {
    app.otherChannel()
  }).toThrow('Unknown channel must have access callback')

  app.otherChannel({ access: true })
  expect(() => {
    app.otherChannel({ access: true })
  }).toThrow('Callbacks for unknown channel are already defined')
})

it('allows to have custom channel name check', async () => {
  let test = createReporter()
  let channels = []
  test.app.otherChannel({
    access (ctx, action, meta) {
      channels.push(ctx.params[0])
      test.app.wrongChannel(action, meta)
    }
  })
  test.app.nodeIds['10:uuid'] = {
    connection: { send: jest.fn() },
    node: { onAdd () { } }
  }
  test.app.clientIds['10:uuid'] = test.app.nodeIds['10:uuid']
  await test.app.log.add(
    { type: 'logux/subscribe', channel: 'foo' }
  )
  expect(channels).toEqual(['foo'])
  expect(test.names).toEqual([
    'add', 'wrongChannel', 'add', 'clean', 'clean'
  ])
})

it('ignores subscription for other servers', async () => {
  let test = createReporter()
  let action = { type: 'logux/subscribe' }
  await test.app.log.add(action, { server: 'server:other' })
  expect(test.names).toEqual(['add', 'clean'])
})

it('checks channel access', async () => {
  let test = createReporter()
  let client = {
    node: { remoteSubprotocol: '0.0.0', onAdd: () => false }
  }
  test.app.nodeIds['10:uuid'] = client
  test.app.clientIds['10:uuid'] = client

  test.app.channel(/^user\/(\d+)$/, {
    async access (ctx) {
      expect(ctx.params[1]).toEqual('10')
      return false
    }
  })

  await test.app.log.add(
    { type: 'logux/subscribe', channel: 'user/10' }, { id: '1 10:uuid 0' }
  )
  await delay(1)

  expect(test.names).toEqual(['add', 'clean', 'denied', 'add', 'clean'])
  expect(test.reports[2][1]).toEqual({ actionId: '1 10:uuid 0' })
  expect(test.reports[3][1].action).toEqual({
    type: 'logux/undo', id: '1 10:uuid 0', reason: 'denied'
  })
  expect(test.app.subscribers).toEqual({ })
})

it('reports about errors during channel authorization', async () => {
  let test = createReporter()
  let client = {
    node: { remoteSubprotocol: '0.0.0', onAdd: () => false }
  }
  test.app.nodeIds['10:uuid'] = client
  test.app.clientIds['10:uuid'] = client

  let err = new Error()
  test.app.channel(/^user\/(\d+)$/, {
    access () {
      throw err
    }
  })

  await test.app.log.add(
    { type: 'logux/subscribe', channel: 'user/10' }, { id: '1 10:uuid 0' }
  )
  await async () => {}

  await async () => {}

  expect(test.names).toEqual(['add', 'error', 'add', 'clean', 'clean'])
  expect(test.reports[1][1]).toEqual({ actionId: '1 10:uuid 0', err })
  expect(test.reports[2][1].action).toEqual({
    type: 'logux/undo', id: '1 10:uuid 0', reason: 'error'
  })
  expect(test.app.subscribers).toEqual({ })
})

it('subscribes clients', async () => {
  let test = createReporter()
  let client = {
    node: { remoteSubprotocol: '0.0.0', onAdd: () => false }
  }
  test.app.nodeIds['10:a:uuid'] = client
  test.app.clientIds['10:a'] = client

  let userSubsriptions = 0
  test.app.channel('user/:id', {
    access (ctx, action, meta) {
      expect(ctx.params.id).toEqual('10')
      expect(action.channel).toEqual('user/10')
      expect(meta.id).toEqual('1 10:a:uuid 0')
      expect(ctx.nodeId).toEqual('10:a:uuid')
      userSubsriptions += 1
      return true
    }
  })

  function filter () { }
  test.app.channel('posts', {
    access () {
      return true
    },
    filter () {
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
    { type: 'logux/subscribe', channel: 'user/10' }, { id: '1 10:a:uuid 0' }
  )
  await delay(1)
  expect(events).toEqual(1)
  expect(userSubsriptions).toEqual(1)
  expect(test.names).toEqual(['add', 'clean', 'subscribed', 'add', 'clean'])
  expect(test.reports[2][1]).toEqual({
    actionId: '1 10:a:uuid 0', channel: 'user/10'
  })
  expect(test.reports[3][1].action).toEqual({
    type: 'logux/processed', id: '1 10:a:uuid 0'
  })
  expect(test.reports[3][1].meta.clients).toEqual(['10:a'])
  expect(test.reports[3][1].meta.status).toEqual('processed')
  expect(test.app.subscribers).toEqual({
    'user/10': {
      '10:a:uuid': true
    }
  })
  await test.app.log.add(
    { type: 'logux/subscribe', channel: 'posts' }, { id: '2 10:a:uuid 0' }
  )
  await delay(1)

  expect(events).toEqual(2)
  expect(test.app.subscribers).toEqual({
    'user/10': {
      '10:a:uuid': true
    },
    'posts': {
      '10:a:uuid': filter
    }
  })
  await test.app.log.add(
    { type: 'logux/unsubscribe', channel: 'user/10' },
    { id: '3 10:a:uuid 0' }
  )

  expect(test.names).toEqual([
    'add', 'clean', 'subscribed',
    'add', 'clean', 'add', 'clean', 'subscribed',
    'add', 'clean', 'add', 'unsubscribed', 'add', 'clean', 'clean'
  ])
  expect(test.reports[11][1]).toEqual({
    actionId: '3 10:a:uuid 0', channel: 'user/10'
  })
  expect(test.reports[12][1].action).toEqual({
    type: 'logux/processed', id: '3 10:a:uuid 0'
  })
  expect(test.app.subscribers).toEqual({
    posts: {
      '10:a:uuid': filter
    }
  })
})

it('cancels subscriptions on disconnect', async () => {
  app = createServer()
  let client = {
    node: { remoteSubprotocol: '0.0.0', onAdd: () => false }
  }
  app.nodeIds['10:uuid'] = client
  app.clientIds['10:uuid'] = client

  let cancels = 0
  app.on('subscriptionCancelled', () => {
    cancels += 1
  })

  app.channel('test', {
    access () {
      delete app.clientIds['10:uuid']
      delete app.nodeIds['10:uuid']
      return true
    },
    filter () {
      throw new Error('no calls')
    },
    init () {
      throw new Error('no calls')
    }
  })

  await app.log.add(
    { type: 'logux/subscribe', channel: 'test' }, { id: '1 10:uuid 0' }
  )
  await delay(10)

  expect(cancels).toEqual(1)
})

it('reports about errors during channel initialization', async () => {
  let test = createReporter()
  let client = {
    node: { remoteSubprotocol: '0.0.0', onAdd: () => false }
  }
  test.app.nodeIds['10:uuid'] = client
  test.app.clientIds['10:uuid'] = client

  let err = new Error()
  test.app.channel(/^user\/(\d+)$/, {
    access: () => true,
    init () {
      throw err
    }
  })

  await test.app.log.add(
    { type: 'logux/subscribe', channel: 'user/10' }, { id: '1 10:uuid 0' }
  )
  await delay(1)

  expect(test.names).toEqual([
    'add', 'clean', 'subscribed', 'error', 'add', 'clean',
    'unsubscribed', 'add', 'clean'
  ])
  expect(test.reports[3][1]).toEqual({ actionId: '1 10:uuid 0', err })
  expect(test.reports[4][1].action).toEqual({
    type: 'logux/undo', id: '1 10:uuid 0', reason: 'error'
  })
  expect(test.app.subscribers).toEqual({ })
})

it('loads initial actions during subscription', async () => {
  let test = createReporter({ time: new TestTime() })
  let client = {
    node: { remoteSubprotocol: '0.0.0', onAdd: () => false }
  }
  test.app.nodeIds['10:uuid'] = client
  test.app.clientIds['10:uuid'] = client

  test.app.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  let userLoaded = 0
  let initializating
  test.app.channel('user/:id', {
    access: () => true,
    init (ctx, action, meta) {
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
    { type: 'logux/subscribe', channel: 'user/10' }, { id: '1 10:uuid 0' }
  )
  await delay(1)
  expect(userLoaded).toEqual(1)
  expect(test.app.subscribers).toEqual({
    'user/10': {
      '10:uuid': true
    }
  })
  expect(test.app.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'user/10' }
  ])
  initializating()
  await delay(1)

  expect(test.app.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'user/10' },
    { type: 'logux/processed', id: '1 10:uuid 0' }
  ])
})

it('does not need type definition for own actions', async () => {
  let test = createReporter()
  await test.app.log.add({ type: 'unknown' }, { users: ['10'] })
  expect(test.names).toEqual(['add', 'clean'])
  expect(test.reports[0][1].action.type).toEqual('unknown')
  expect(test.reports[0][1].meta.status).toEqual('processed')
})

it('checks callbacks in unknown type handler', () => {
  app = createServer()

  expect(() => {
    app.otherType({ process: () => true })
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
    process: () => true
  })
  test.app.channel('a', { access: () => true })
  test.app.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })
  await test.app.log.add({ type: 'unknown' }, { status: 'processed' })
  await test.app.log.add({ type: 'known' })
  await test.app.log.add({ type: 'logux/subscribe', channel: 'a' })
  await test.app.log.add({ type: 'known' }, { channels: ['a'] })
  await test.app.log.add({ type: 'known' }, { users: ['10'] })
  await test.app.log.add({ type: 'known' }, { clients: ['10:client'] })
  await test.app.log.add({ type: 'known' }, { nodes: ['10:client:uuid'] })
  expect(test.names).toEqual([
    'add', 'useless',
    'add', 'processed', 'add', 'add',
    'processed', 'add', 'processed', 'add', 'processed', 'add', 'processed'
  ])
})

it('has shortcuts for resend arrays', async () => {
  let test = createReporter()
  test.app.type('A', {
    access: () => true,
    process: () => true
  })
  test.app.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })
  await test.app.log.add(
    { type: 'A' }, { channel: 'a', user: '1', client: '1:1', node: '1:1:1' }
  )
  expect(test.app.log.entries()).toEqual([
    [
      { type: 'A' },
      {
        added: 1,
        id: '1 server:uuid 0',
        reasons: ['test'],
        server: 'server:uuid',
        status: 'processed',
        subprotocol: '0.0.0',
        channels: ['a'],
        users: ['1'],
        clients: ['1:1'],
        nodes: ['1:1:1'],
        time: 1
      }
    ]
  ])
})
