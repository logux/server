'use strict'

const MemoryStore = require('logux-core').MemoryStore
const WebSocket = require('uws')
const https = require('https')
const http = require('http')
const path = require('path')
const Log = require('logux-core').Log
const fs = require('fs')

const BaseServer = require('../base-server')
const promisify = require('../promisify')

const DEFAULT_OPTIONS = {
  subprotocol: '0.0.0',
  supports: '0.x',
  nodeId: 'server'
}
const CERT = path.join(__dirname, 'fixtures/cert.pem')
const KEY = path.join(__dirname, 'fixtures/key.pem')

let lastPort = 9111
function createServer (options, reporter) {
  if (!options) options = { }
  for (const i in DEFAULT_OPTIONS) {
    if (typeof options[i] === 'undefined') {
      options[i] = DEFAULT_OPTIONS[i]
    }
  }
  if (typeof options.port === 'undefined') {
    lastPort += 1
    options.port = lastPort
  }

  const created = new BaseServer(options, reporter)
  created.auth(() => true)
  let lastId = 0
  created.log.generateId = () => [++lastId, 'server', 0]

  return created
}

let app, server

function createReporter (opts) {
  const result = { }
  result.reports = []
  result.names = []
  app = createServer(opts, function () {
    result.names.push(arguments[0])
    result.reports.push(Array.prototype.slice.call(arguments, 0))
  })
  result.app = app
  return result
}

function wait (ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

const originEnv = process.env.NODE_ENV

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
    supports: '0.x',
    nodeId: 'server'
  })
  expect(app.options.supports).toEqual('0.x')
})

it('saves node ID', () => {
  app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    nodeId: 'server'
  })
  expect(app.nodeId).toEqual('server')
  expect(app.nodeId).toEqual(app.options.nodeId)
  expect(app.nodeId).toEqual(app.log.nodeId)
})

it('generates node ID', () => {
  app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x'
  })
  expect(app.nodeId).toMatch(/server:[\w\d]+/)
})

it('throws on missed subprotocol', () => {
  expect(() => {
    new BaseServer({ })
  }).toThrowError(/subprotocol version/)
})

it('throws on missed supported subprotocols', () => {
  expect(() => {
    new BaseServer({ subprotocol: '0.0.0' })
  }).toThrowError(/supported subprotocol/)
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
  const store = new MemoryStore()
  app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    store
  })
  expect(app.log.store).toBe(store)
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

it('uses 1337 port by default', () => {
  app = createServer()
  expect(app.options.port).toEqual(1337)
})

it('uses user port', () => {
  app = createServer({ port: 31337 })
  expect(app.options.port).toEqual(31337)
})

it('uses 127.0.0.1 to bind server by default', () => {
  app = createServer()
  expect(app.options.host).toEqual('127.0.0.1')
})

it('throws a error on key without certificate', () => {
  expect(() => {
    app = createServer({ key: fs.readFileSync(KEY) })
  }).toThrowError(/set cert option/)
})

it('throws a error on certificate without key', () => {
  expect(() => {
    app = createServer({ cert: fs.readFileSync(CERT) })
  }).toThrowError(/set key option/)
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
  const test = createReporter()

  const promise = test.app.listen()
  expect(test.reports).toEqual([])

  return promise.then(() => {
    expect(test.reports).toEqual([['listen', test.app]])
  })
})

it('reporters on log events', () => {
  const test = createReporter()
  test.app.type('A', { access: () => true })
  test.app.log.add({ type: 'A' })
  const meta = {
    id: [1, 'server', 0],
    reasons: [],
    status: 'waiting',
    server: 'server',
    time: 1
  }
  expect(test.reports).toEqual([
    ['add', test.app, { type: 'A' }, meta],
    ['clean', test.app, { type: 'A' }, meta]
  ])
})

it('reporters on destroing', () => {
  const test = createReporter()
  const promise = test.app.destroy()
  expect(test.reports).toEqual([['destroy', test.app]])
  return promise
})

it('creates a client on connection', () => {
  app = createServer()
  return app.listen().then(() => {
    const ws = new WebSocket(`ws://127.0.0.1:${ app.options.port }`)
    return new Promise((resolve, reject) => {
      ws.internalOnOpen = resolve
      ws.internalOnError = reject
    })
  }).then(() => {
    expect(Object.keys(app.clients).length).toBe(1)
    expect(app.clients[1].remoteAddress).toEqual('127.0.0.1')
  })
})

it('send debug message to clients on runtimeError', () => {
  app = createServer()
  app.clients[1] = { connection: { send: jest.fn() }, destroy: () => false }

  const error = new Error('Test Error')
  error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`

  app.debugError(error)
  expect(app.clients[1].connection.send).toBeCalledWith([
    'debug',
    'error',
    'Error: Test Error\n' +
    'fake stacktrace'
  ])
})

it('disconnects client on destroy', () => {
  app = createServer()
  app.clients[1] = { destroy: jest.fn() }
  app.destroy()
  expect(app.clients[1].destroy).toBeCalled()
})

it('accepts custom HTTP server', () => {
  server = http.createServer()
  const test = createReporter({ server })

  return promisify(done => {
    server.listen(test.app.options.port, done)
  }).then(() => test.app.listen()).then(() => {
    const ws = new WebSocket(`ws://localhost:${ test.app.options.port }`)
    return new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
  }).then(() => {
    expect(Object.keys(test.app.clients).length).toBe(1)
  })
})

it('marks actions with own node ID', () => {
  app = createServer()
  app.type('A', { access: () => true })

  const servers = []
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

  const statuses = []
  app.log.on('add', (action, meta) => {
    statuses.push(meta.status)
  })

  return Promise.all([
    app.log.add({ type: 'A' }),
    app.log.add({ type: 'A' }, { status: 'processed' })
  ]).then(() => {
    expect(statuses).toEqual(['waiting', 'processed'])
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
  const test = createReporter()
  return test.app.log.add({ type: 'UNKNOWN' }).then(() => {
    expect(test.names).toEqual(['add', 'unknowType', 'clean'])
    expect(test.reports[1][1]).toEqual(test.app)
    expect(test.reports[1][2]).toEqual({ type: 'UNKNOWN' })
    expect(test.reports[1][3].id).toEqual([1, 'server', 0])
  })
})

it('ignores unknown type for processed actions', () => {
  const test = createReporter()
  return test.app.log.add({ type: 'A' }, { status: 'processed' }).then(() => {
    expect(test.names).toEqual(['add', 'clean'])
  })
})

it('sends errors to clients in development', () => {
  const test = createReporter({ env: 'development' })
  test.app.clients[0] = {
    connection: { send: jest.fn() },
    destroy: () => false
  }

  const error = new Error('Test')
  error.stack = 'stack'
  test.app.emitter.emit('error', error)

  expect(test.reports).toEqual([
    ['runtimeError', test.app, error, undefined, undefined]
  ])
  expect(test.app.clients[0].connection.send).toHaveBeenCalledWith(
    ['debug', 'error', 'stack']
  )
})

it('does not send errors in non-development mode', () => {
  const test = createReporter({ env: 'production' })
  test.app.clients[0] = {
    connection: { send: jest.fn() },
    destroy: () => false
  }
  test.app.emitter.emit('error', new Error('Test'))
  expect(test.app.clients[0].connection.send).not.toHaveBeenCalled()
})

it('processes actions', () => {
  const test = createReporter()
  const processed = []
  const fired = []

  test.app.type('FOO', {
    access: () => true,
    process (action, meta, user) {
      expect(meta.added).toEqual(1)
      expect(user).toEqual('server')
      return wait(25).then(() => {
        processed.push(action)
      })
    }
  })
  test.app.on('processed', (action, meta) => {
    expect(meta.added).toEqual(1)
    fired.push(action)
  })

  return test.app.log.add({ type: 'FOO' }, { reasons: ['test'] })
    .then(() => wait(1))
    .then(() => {
      expect(fired).toEqual([])
      return wait(30)
    }).then(() => {
      expect(processed).toEqual([{ type: 'FOO' }])
      expect(fired).toEqual([{ type: 'FOO' }])
      expect(test.names).toEqual(['add', 'processed'])
      expect(test.reports[1][1]).toEqual(test.app)
      expect(test.reports[1][2]).toEqual({ type: 'FOO' })
      expect(test.reports[1][3].added).toEqual(1)
      expect(test.reports[1][4]).toBeCloseTo(25, -2)
    })
})

it('has full events API', () => {
  app = createServer()

  let always = 0
  const unbind = app.on('processed', () => {
    always += 1
  })
  let once = 0
  app.once('processed', () => {
    once += 1
  })

  app.emitter.emit('processed')
  app.emitter.emit('processed')
  unbind()
  app.emitter.emit('processed')

  expect(always).toEqual(2)
  expect(once).toEqual(1)
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
    return wait(1)
  }).then(() => {
    expect(destroyed).toBeFalsy()
    expect(app.processing).toEqual(1)
    return app.log.add({ type: 'FOO' })
  }).then(() => {
    expect(started).toEqual(1)
    process()
    return wait(1)
  }).then(() => {
    expect(destroyed).toBeTruthy()
  })
})

it('reports about error during action processing', () => {
  const test = createReporter()

  const error = new Error('Test')
  app.type('FOO', {
    access: () => true,
    process () {
      throw error
    }
  })

  return app.log.add({ type: 'FOO' }).then(() => {
    return wait(1)
  }).then(() => {
    expect(test.names).toEqual(['add', 'clean', 'runtimeError', 'add'])
    expect(test.reports[2][1]).toEqual(test.app)
    expect(test.reports[2][2]).toEqual(error)
    expect(test.reports[2][3]).toEqual({ type: 'FOO' })
    expect(test.reports[2][4].id).toEqual([1, 'server', 0])
    expect(test.reports[3][2]).toEqual({
      type: 'logux/undo', reason: 'error', id: [1, 'server', 0]
    })
  })
})
