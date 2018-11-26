let MemoryStore = require('logux-core').MemoryStore
let WebSocket = require('ws')
let TestTime = require('logux-core').TestTime
let delay = require('nanodelay')
let https = require('https')
let http = require('http')
let path = require('path')
let Log = require('logux-core').Log
let fs = require('fs')

let BaseServer = require('../base-server')
let promisify = require('../promisify')
let pkg = require('../package.json')

const DEFAULT_OPTIONS = {
  subprotocol: '0.0.0',
  supports: '0.x'
}
const CERT = path.join(__dirname, 'fixtures/cert.pem')
const KEY = path.join(__dirname, 'fixtures/key.pem')

let lastPort = 9111
function createServer (options) {
  if (!options) options = { }
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

afterEach(() => {
  process.env.NODE_ENV = originEnv
  return Promise.all([
    app ? app.destroy() : true,
    server ? promisify(done => server.close(done)) : true
  ]).then(() => {
    app = undefined
    server = undefined
  })
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
  expect(app.nodeId).toMatch(/server:[\w\d~_]+/)
})

it('throws on missed subprotocol', () => {
  expect(() => {
    new BaseServer({ })
  }).toThrowError(/Missed `subprotocol` option/)
})

it('throws on missed supported subprotocols', () => {
  expect(() => {
    new BaseServer({ subprotocol: '0.0.0' })
  }).toThrowError(/Missed `supports` option/)
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
  expect(app.log instanceof Log).toBeTruthy()
  expect(app.log.store instanceof MemoryStore).toBeTruthy()
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

it('destroys application without runned server', () => {
  app = new BaseServer(DEFAULT_OPTIONS)
  return app.destroy().then(() => app.destroy())
})

it('throws without authenticator', () => {
  app = new BaseServer(DEFAULT_OPTIONS)
  expect(() => {
    app.listen()
  }).toThrowError(/authentication/)
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
    app = createServer({ key: fs.readFileSync(KEY) })
  }).toThrowError(/set `cert` option/)
})

it('throws a error on certificate without key', () => {
  expect(() => {
    app = createServer({ cert: fs.readFileSync(CERT) })
  }).toThrowError(/set `key` option/)
})

it('uses HTTPS', () => {
  app = createServer({
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY)
  })
  return app.listen().then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('loads keys by absolute path', () => {
  app = createServer({
    cert: CERT,
    key: KEY
  })
  return app.listen().then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('loads keys by relative path', () => {
  app = createServer({
    root: __dirname,
    cert: 'fixtures/cert.pem',
    key: 'fixtures/key.pem'
  })
  return app.listen().then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('supports object in SSL key', () => {
  app = createServer({
    cert: fs.readFileSync(CERT),
    key: { pem: fs.readFileSync(KEY) }
  })
  return app.listen().then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('reporters on start listening', () => {
  let test = createReporter({
    controlPassword: 'secret',
    backend: 'http://127.0.0.1:3000/logux'
  })

  let promise = test.app.listen()
  expect(test.reports).toEqual([])

  return promise.then(() => {
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
        cert: false,
        host: '127.0.0.1',
        port: test.app.options.port
      }]
    ])
  })
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

it('creates a client on connection', () => {
  app = createServer()
  return app.listen().then(() => {
    let ws = new WebSocket(`ws://127.0.0.1:${ app.options.port }`)
    return new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
  }).then(() => {
    expect(Object.keys(app.clients)).toHaveLength(1)
    expect(app.clients[1].remoteAddress).toEqual('127.0.0.1')
  })
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
  expect(Object.keys(app.clients)).toHaveLength(1)
  expect(app.clients[1].remoteAddress).toEqual('127.0.0.1')
})

it('sends debug message to clients on runtimeError', () => {
  app = createServer()
  app.clients[1] = {
    connection: {
      connected: true,
      send: jest.fn()
    },
    destroy: () => false
  }
  app.clients[2] = {
    connection: {
      connected: false,
      send: jest.fn()
    },
    destroy: () => false
  }
  app.clients[3] = {
    connection: {
      connected: true,
      send: () => { throw new Error() }
    },
    destroy: () => false
  }

  let error = new Error('Test Error')
  error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`

  app.debugError(error)
  expect(app.clients[1].connection.send).toBeCalledWith([
    'debug',
    'error',
    'Error: Test Error\n' +
    'fake stacktrace'
  ])
  expect(app.clients[2].connection.send).not.toHaveBeenCalled()
})

it('disconnects client on destroy', () => {
  app = createServer()
  app.clients[1] = { destroy: jest.fn() }
  app.destroy()
  expect(app.clients[1].destroy).toBeCalled()
})

it('accepts custom HTTP server', () => {
  server = http.createServer()
  app = createServer({ server })

  return promisify(done => {
    server.listen(app.options.port, done)
  }).then(() => app.listen()).then(() => {
    let ws = new WebSocket(`ws://localhost:${ app.options.port }`)
    return new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
  }).then(() => {
    expect(Object.keys(app.clients)).toHaveLength(1)
  })
})

it('marks actions with own node ID', () => {
  app = createServer()
  app.type('A', { access: () => true })

  let servers = []
  app.log.on('add', (action, meta) => {
    servers.push(meta.server)
  })

  return Promise.all([
    app.log.add({ type: 'A' }),
    app.log.add({ type: 'A' }, { server: 'server2' })
  ]).then(() => {
    expect(servers).toEqual([app.nodeId, 'server2'])
  })
})

it('marks actions with waiting status', () => {
  app = createServer()
  app.type('A', { access: () => true })
  app.channel('a', { access: () => true })

  let statuses = []
  app.log.on('add', (action, meta) => {
    statuses.push(meta.status)
  })

  return Promise.all([
    app.log.add({ type: 'A' }),
    app.log.add({ type: 'A' }, { status: 'processed' }),
    app.log.add({ type: 'logux/subscribe', channel: 'a' })
  ]).then(() => {
    expect(statuses).toEqual(['waiting', 'processed', undefined])
  })
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
  }).toThrowError(/already/)
})

it('requires access callback for type', () => {
  app = createServer()
  expect(() => {
    app.type('FOO')
  }).toThrowError(/access callback/)
})

it('reports about unknown action type', () => {
  let test = createReporter()
  return test.app.log.add(
    { type: 'UNKNOWN' }, { id: '1 10:uuid 0' }
  ).then(() => {
    expect(test.names).toEqual(['add', 'unknownType', 'add', 'clean', 'clean'])
    expect(test.reports[1]).toEqual(['unknownType', {
      actionId: '1 10:uuid 0',
      type: 'UNKNOWN'
    }])
  })
})

it('ignores unknown type for processed actions', () => {
  let test = createReporter()
  return test.app.log.add(
    { type: 'A' }, { status: 'processed', channels: ['a'] }
  ).then(() => {
    expect(test.names).toEqual(['add', 'clean'])
  })
})

it('sends errors to clients in development', () => {
  let test = createReporter({ env: 'development' })
  test.app.clients[0] = {
    connection: { connected: true, send: jest.fn() },
    destroy: () => false
  }

  let err = new Error('Test')
  err.stack = 'stack'
  test.app.emitter.emit('error', err)

  expect(test.reports).toEqual([['error', { err, fatal: true }]])
  expect(test.app.clients[0].connection.send).toHaveBeenCalledWith(
    ['debug', 'error', 'stack']
  )
})

it('does not send errors in non-development mode', () => {
  app = createServer({ env: 'production' })
  app.clients[0] = {
    connection: { send: jest.fn() },
    destroy: () => false
  }
  app.emitter.emit('error', new Error('Test'))
  expect(app.clients[0].connection.send).not.toHaveBeenCalled()
})

it('processes actions', () => {
  let test = createReporter()
  let processed = []
  let fired = []

  test.app.type('FOO', {
    access: () => true,
    process (ctx, action, meta) {
      expect(meta.added).toEqual(1)
      expect(ctx.isServer).toBeTruthy()
      return delay(25).then(() => {
        processed.push(action)
      })
    }
  })
  test.app.on('processed', (action, meta, latency) => {
    expect(typeof latency).toEqual('number')
    expect(meta.added).toEqual(1)
    fired.push(action)
  })

  return test.app.log.add({ type: 'FOO' }, { reasons: ['test'] })
    .then(() => Promise.resolve())
    .then(() => {
      expect(fired).toEqual([])
      expect(test.app.log.entries()[0][1].status).toEqual('waiting')
      return delay(30)
    }).then(() => {
      expect(test.app.log.entries()[0][1].status).toEqual('processed')
      expect(processed).toEqual([{ type: 'FOO' }])
      expect(fired).toEqual([{ type: 'FOO' }])
      expect(test.names).toEqual(['add', 'processed'])
      expect(Object.keys(test.reports[1][1])).toEqual(['actionId', 'latency'])
      expect(test.reports[1][1].actionId).toEqual('1 server:uuid 0')
      expect(test.reports[1][1].latency).toBeCloseTo(25, -2)
    })
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

it('waits for last processing before destroy', () => {
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
  return app.log.add({ type: 'FOO' }).then(() => {
    app.destroy().then(() => {
      destroyed = true
    })
    return Promise.resolve()
  }).then(() => {
    expect(destroyed).toBeFalsy()
    expect(app.processing).toEqual(1)
    return app.log.add({ type: 'FOO' })
  }).then(() => {
    expect(started).toEqual(1)
    process()
    return delay(1)
  }).then(() => {
    expect(destroyed).toBeTruthy()
  })
})

it('reports about error during action processing', () => {
  let test = createReporter()

  let err = new Error('Test')
  app.type('FOO', {
    access: () => true,
    process () {
      throw err
    }
  })

  return app.log.add({ type: 'FOO' }, { reasons: ['test'] }).then(() => {
    return delay(1)
  }).then(() => {
    expect(test.names).toEqual(['add', 'error', 'add'])
    expect(test.reports[1]).toEqual(['error', {
      actionId: '1 server:uuid 0',
      err
    }])
    expect(test.reports[2][1].action).toEqual({
      type: 'logux/undo', reason: 'error', id: '1 server:uuid 0'
    })
  })
})

it('undos actions on client', () => {
  app = createServer()
  app.undo({
    id: '1 1:client:uuid 0',
    users: ['3'],
    clients: ['2:client'],
    reasons: ['user/1/lastValue'],
    nodeIds: ['2:client:uuid'],
    channels: ['user/1']
  }, 'magic')
  return Promise.resolve().then(() => {
    expect(app.log.entries()).toEqual([
      [
        {
          id: '1 1:client:uuid 0',
          type: 'logux/undo',
          reason: 'magic'
        },
        {
          id: '1 server:uuid 0',
          time: 1,
          added: 1,
          users: ['3'],
          server: 'server:uuid',
          status: 'processed',
          clients: ['1:client', '2:client'],
          nodeIds: ['2:client:uuid'],
          reasons: ['user/1/lastValue'],
          channels: ['user/1'],
          subprotocol: '0.0.0'
        }
      ]
    ])
  })
})

it('adds current subprotocol to meta', () => {
  app = createServer({ subprotocol: '1.0.0' })
  app.type('A', { access: () => true })
  return app.log.add({ type: 'A' }, { reasons: ['test'] }).then(() => {
    expect(app.log.entries()[0][1].subprotocol).toEqual('1.0.0')
  })
})

it('adds current subprotocol only to own actions', () => {
  app = createServer({ subprotocol: '1.0.0' })
  app.type('A', { access: () => true })
  return app.log.add(
    { type: 'A' },
    { id: '1 0:other 0', reasons: ['test'] }
  ).then(() => {
    expect(app.log.entries()[0][1].subprotocol).toBeUndefined()
  })
})

it('allows to override subprotocol in meta', () => {
  app = createServer({ subprotocol: '1.0.0' })
  app.type('A', { access: () => true })
  return app.log.add(
    { type: 'A' },
    { subprotocol: '0.1.0', reasons: ['test'] }
  ).then(() => {
    expect(app.log.entries()[0][1].subprotocol).toEqual('0.1.0')
  })
})

it('checks channel definition', () => {
  app = createServer()

  expect(() => {
    app.channel('foo/:id')
  }).toThrowError('Channel foo/:id must have access callback')

  expect(() => {
    app.channel(/^foo:/, { init: true })
  }).toThrowError('Channel /^foo:/ must have access callback')
})

it('reports about wrong channel name', () => {
  let test = createReporter({ env: 'development' })
  test.app.channel('foo', { access: () => true })
  test.app.nodeIds['10:uuid'] = {
    connection: { send: jest.fn() },
    node: { onAdd () { } }
  }
  test.app.clientIds['10:uuid'] = test.app.nodeIds['10:uuid']
  return test.app.log.add(
    { type: 'logux/subscribe' }, { id: '1 10:uuid 0' }
  ).then(() => {
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
    return test.app.log.add({ type: 'logux/unsubscribe' })
  }).then(() => {
    expect(test.reports[6]).toEqual(['wrongChannel', {
      actionId: '2 server:uuid 0', channel: undefined
    }])
    return test.app.log.add({ type: 'logux/subscribe', channel: 'unknown' })
  }).then(() => {
    expect(test.reports[11]).toEqual(['wrongChannel', {
      actionId: '4 server:uuid 0', channel: 'unknown'
    }])
  })
})

it('checks custom channel name subscriber', () => {
  app = createServer()

  expect(() => {
    app.otherChannel()
  }).toThrowError('Unknown channel must have access callback')

  app.otherChannel({ access: true })
  expect(() => {
    app.otherChannel({ access: true })
  }).toThrowError('Callbacks for unknown channel are already defined')
})

it('allows to have custom channel name check', () => {
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
  return test.app.log.add(
    { type: 'logux/subscribe', channel: 'foo' }
  ).then(() => {
    expect(channels).toEqual(['foo'])
    expect(test.names).toEqual([
      'add', 'wrongChannel', 'add', 'clean', 'clean'
    ])
  })
})

it('ignores subscription for other servers', () => {
  let test = createReporter()
  let action = { type: 'logux/subscribe' }
  return test.app.log.add(action, { server: 'server:other' }).then(() => {
    expect(test.names).toEqual(['add', 'clean'])
  })
})

it('checks channel access', () => {
  let test = createReporter()
  let client = {
    node: { remoteSubprotocol: '0.0.0', onAdd: () => false }
  }
  test.app.nodeIds['10:uuid'] = client
  test.app.clientIds['10:uuid'] = client

  test.app.channel(/^user\/(\d+)$/, {
    access (ctx) {
      expect(ctx.params[1]).toEqual('10')
      return Promise.resolve(false)
    }
  })

  return test.app.log.add(
    { type: 'logux/subscribe', channel: 'user/10' }, { id: '1 10:uuid 0' }
  ).then(() => {
    return Promise.resolve()
  }).then(() => {
    expect(test.names).toEqual(['add', 'clean', 'denied', 'add', 'clean'])
    expect(test.reports[2][1]).toEqual({ actionId: '1 10:uuid 0' })
    expect(test.reports[3][1].action).toEqual({
      type: 'logux/undo', id: '1 10:uuid 0', reason: 'denied'
    })
    expect(test.app.subscribers).toEqual({ })
  })
})

it('reports about errors during channel authorization', () => {
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

  return test.app.log.add(
    { type: 'logux/subscribe', channel: 'user/10' }, { id: '1 10:uuid 0' }
  ).then(() => {
    return Promise.resolve()
  }).then(() => {
    return Promise.resolve()
  }).then(() => {
    expect(test.names).toEqual(['add', 'clean', 'error', 'add', 'clean'])
    expect(test.reports[2][1]).toEqual({ actionId: '1 10:uuid 0', err })
    expect(test.reports[3][1].action).toEqual({
      type: 'logux/undo', id: '1 10:uuid 0', reason: 'error'
    })
    expect(test.app.subscribers).toEqual({ })
  })
})

it('subscribes clients', () => {
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

  return test.app.log.add(
    { type: 'logux/subscribe', channel: 'user/10' }, { id: '1 10:a:uuid 0' }
  ).then(() => {
    return Promise.resolve()
  }).then(() => {
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
    return test.app.log.add(
      { type: 'logux/subscribe', channel: 'posts' }, { id: '2 10:a:uuid 0' }
    )
  }).then(() => {
    return Promise.resolve()
  }).then(() => {
    expect(test.app.subscribers).toEqual({
      'user/10': {
        '10:a:uuid': true
      },
      'posts': {
        '10:a:uuid': filter
      }
    })
    return test.app.log.add(
      { type: 'logux/unsubscribe', channel: 'user/10' },
      { id: '3 10:a:uuid 0' }
    )
  }).then(() => {
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
      'posts': {
        '10:a:uuid': filter
      }
    })
  })
})

it('keeps data between subscription steps', () => {
  app = createServer()
  let client = {
    node: { remoteSubprotocol: '0.0.0', onAdd: () => false }
  }
  app.nodeIds['10:uuid'] = client
  app.clientIds['10:uuid'] = client

  let subsriptions = 0

  app.channel('test', {
    access (ctx) {
      ctx.data.one = 1
      return true
    },
    filter (ctx) {
      expect(ctx.data.one).toEqual(1)
      return () => true
    },
    init (ctx) {
      expect(ctx.data.one).toEqual(1)
      subsriptions += 1
    }
  })

  return app.log.add(
    { type: 'logux/subscribe', channel: 'test' }, { id: '1 10:uuid 0' }
  ).then(() => {
    return delay(10)
  }).then(() => {
    expect(subsriptions).toEqual(1)
  })
})

it('reports about errors during channel initialization', () => {
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

  return test.app.log.add(
    { type: 'logux/subscribe', channel: 'user/10' }, { id: '1 10:uuid 0' }
  ).then(() => {
    return delay(1)
  }).then(() => {
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
})

it('loads initial actions during subscription', () => {
  let test = createReporter({ time: new TestTime() })
  let client = {
    node: { remoteSubprotocol: '0.0.0', onAdd: () => false }
  }
  test.app.nodeIds['10:uuid'] = client
  test.app.clientIds['10:uuid'] = client

  test.app.log.on('preadd', (action, meta) => {
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

  return test.app.log.add(
    { type: 'logux/subscribe', channel: 'user/10' }, { id: '1 10:uuid 0' }
  ).then(() => {
    return Promise.resolve()
  }).then(() => {
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
    return delay(1)
  }).then(() => {
    expect(test.app.log.actions()).toEqual([
      { type: 'logux/subscribe', channel: 'user/10' },
      { type: 'logux/processed', id: '1 10:uuid 0' }
    ])
  })
})

it('does not need type definition for own actions', () => {
  let test = createReporter()
  return test.app.log.add({ type: 'unknown' }, { users: ['10'] }).then(() => {
    expect(test.names).toEqual(['add', 'clean'])
    expect(test.reports[0][1].action.type).toEqual('unknown')
    expect(test.reports[0][1].meta.status).toEqual('processed')
  })
})

it('checks callbacks in unknown type handler', () => {
  app = createServer()

  expect(() => {
    app.otherType({ process: () => true })
  }).toThrowError('Unknown type must have access callback')

  app.otherType({ access: () => true })
  expect(() => {
    app.otherType({ access: () => true })
  }).toThrowError('Callbacks for unknown types are already defined')
})

it('reports about useless actions', () => {
  let test = createReporter()
  test.app.type('known', {
    access: () => true,
    process: () => true
  })
  test.app.channel('a', { access: () => true })
  test.app.log.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })
  return Promise.all([
    test.app.log.add({ type: 'unknown' }, { status: 'processed' }),
    test.app.log.add({ type: 'known' }),
    test.app.log.add({ type: 'logux/subscribe', channel: 'a' }),
    test.app.log.add({ type: 'known' }, { channels: ['a'] }),
    test.app.log.add({ type: 'known' }, { users: ['10'] }),
    test.app.log.add({ type: 'known' }, { clients: ['10:client'] }),
    test.app.log.add({ type: 'known' }, { nodeIds: ['10:client:uuid'] })
  ]).then(() => {
    expect(test.names).toEqual([
      'add', 'useless',
      'add', 'add', 'add', 'add', 'add', 'add',
      'processed', 'processed', 'processed', 'processed', 'processed'
    ])
  })
})
