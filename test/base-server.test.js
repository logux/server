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
  supports: '0.x'
}
const CERT = path.join(__dirname, 'fixtures/cert.pem')
const KEY = path.join(__dirname, 'fixtures/key.pem')

let lastPort = 9111
function uniqPort () {
  lastPort += 1
  return lastPort
}

function createServer (options, reporter) {
  const created = new BaseServer(options || DEFAULT_OPTIONS, reporter)
  created.auth(() => true)
  return created
}

function createTest () {
  const created = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    nodeId: 'server'
  })
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

function entries (log) {
  return log.store.created.map(i => [i[0], i[1]])
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
  app = new BaseServer(DEFAULT_OPTIONS)
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
  app = new BaseServer(DEFAULT_OPTIONS)
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
    env: 'production',
    subprotocol: '0.0.0',
    supports: '0.x'
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
  app = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    port: 31337
  })
  expect(app.options.port).toEqual(31337)
})

it('uses 127.0.0.1 to bind server by default', () => {
  app = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    port: uniqPort()
  })
  expect(app.options.host).toEqual('127.0.0.1')
})

it('throws a error on key without certificate', () => {
  expect(() => {
    app = createServer({
      subprotocol: '0.0.0',
      supports: '0.x',
      key: fs.readFileSync(KEY)
    })
  }).toThrowError(/set cert option/)
})

it('throws a error on certificate without key', () => {
  expect(() => {
    app = createServer({
      subprotocol: '0.0.0',
      supports: '0.x',
      cert: fs.readFileSync(CERT)
    })
  }).toThrowError(/set key option/)
})

it('uses HTTPS', () => {
  app = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    port: uniqPort(),
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY)
  })
  return app.listen().then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('loads keys by absolute path', () => {
  app = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    cert: CERT,
    key: KEY,
    port: uniqPort()
  })
  return app.listen().then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('loads keys by relative path', () => {
  app = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    root: __dirname,
    cert: 'fixtures/cert.pem',
    key: 'fixtures/key.pem',
    port: uniqPort()
  })
  return app.listen().then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('supports object in SSL key', () => {
  app = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    cert: fs.readFileSync(CERT),
    key: { pem: fs.readFileSync(KEY) },
    port: uniqPort()
  })
  return app.listen().then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('reporters on start listening', () => {
  const test = createReporter({
    subprotocol: '0.0.0',
    supports: '0.x',
    port: uniqPort()
  })

  const promise = test.app.listen()
  expect(test.reports).toEqual([])

  return promise.then(() => {
    expect(test.reports).toEqual([['listen', test.app]])
  })
})

it('reporters on log events', () => {
  const test = createReporter()
  test.app.log.generateId = () => [1]
  test.app.log.add({ type: 'A' })
  const nodeId = test.app.nodeId
  expect(test.reports).toEqual([
    [
      'add',
      test.app,
      { type: 'A' },
      { id: [1], reasons: [], status: 'waiting', server: nodeId, time: 1 }
    ],
    [
      'clean',
      test.app,
      { type: 'A' },
      { id: [1], reasons: [], status: 'waiting', server: nodeId, time: 1 }
    ]
  ])
})

it('reporters on destroing', () => {
  const test = createReporter()

  const promise = test.app.destroy()
  expect(test.reports).toEqual([['destroy', test.app]])

  return promise
})

it('creates a client on connection', () => {
  app = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    port: uniqPort()
  })
  return app.listen().then(() => {
    const ws = new WebSocket(`ws://127.0.0.1:${ app.options.port }`)
    return new Promise((resolve, reject) => {
      ws.internalOnOpen = resolve
      ws.internalOnError = reject
    })
  }).then(() => {
    expect(Object.keys(app.clients).length).toBe(1)
    const client = app.clients[1]
    expect(client.app.options.host).toEqual('127.0.0.1')
  })
})

it('send debug message to clients on runtimeError', () => {
  app = createServer()
  app.clients[1] = { connection: { send: jest.fn() }, destroy: jest.fn() }

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

it('disconnects on clients on destroy', () => {
  app = createServer()
  app.clients[1] = { destroy: jest.fn() }
  app.destroy()
  expect(app.clients[1].destroy).toBeCalled()
})

it('accepts custom HTTP server', () => {
  server = http.createServer()
  const test = createReporter({
    subprotocol: '0.0.0',
    supports: '0.x',
    server
  })

  const port = uniqPort()

  return promisify(done => {
    server.listen(port, done)
  }).then(() => test.app.listen()).then(() => {
    const ws = new WebSocket(`ws://localhost:${ port }`)
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
  const servers = []
  app.log.on('add', (action, meta) => {
    servers.push(meta.server)
  })

  return Promise.all([
    app.log.add({ type: 'A' }, { reasons: ['test'] }),
    app.log.add({ type: 'B' }, { reasons: ['test'], server: 'server2' })
  ]).then(() => {
    expect(servers).toEqual([app.nodeId, 'server2'])
  })
})

it('marks actions with start status', () => {
  app = createServer()
  app.type('A', {
    access () {
      return new Promise(() => { })
    },
    process () { }
  })
  const statuses = []
  app.log.on('add', (action, meta) => {
    statuses.push(meta.status)
  })

  return Promise.all([
    app.log.add({ type: 'A' }, { reasons: ['test'] }),
    app.log.add({ type: 'B' }, { reasons: ['test'], status: 'processed' })
  ]).then(() => {
    expect(statuses).toEqual(['waiting', 'processed'])
  })
})

it('defines actions types', () => {
  app = createServer()
  app.type('FOO', {
    access () { },
    process () { }
  })
  expect(app.types.FOO).not.toBeUndefined()
})

it('does not allow to define type twice', () => {
  app = createServer()
  app.type('FOO', {
    access () { },
    process () { }
  })
  expect(() => {
    app.type('FOO', {
      access () { },
      process () { }
    })
  }).toThrowError(/already/)
})

it('requires access callback for type', () => {
  app = createServer()
  expect(() => {
    app.type('FOO')
  }).toThrowError(/access callback/)
})

it('requires process callback for type', () => {
  app = createServer()
  expect(() => {
    app.type('FOO', {
      access () { }
    })
  }).toThrowError(/process callback/)
})

it('reports about unknown action type', () => {
  app = createTest()
  const meta = { reasons: ['test'], user: '10' }
  return app.log.add({ type: 'UNKNOWN' }, meta).then(() => {
    expect(entries(app.log)).toEqual([
      [
        { type: 'logux/undo', reason: 'unknowType', id: [1, 'server', 0] },
        {
          added: 2,
          id: [2, 'server', 0],
          time: 2,
          reasons: ['error'],
          server: 'server',
          status: 'processed'
        }
      ], [
        { type: 'UNKNOWN' },
        {
          added: 1,
          id: [1, 'server', 0],
          time: 1,
          reasons: ['test'],
          user: '10',
          server: 'server',
          status: 'error'
        }
      ]
    ])
  })
})

it('ignores unknown type for own and processed actions', () => {
  app = createTest()
  return app.log.add({ type: 'UNKNOWN1' }, { reasons: ['test'] })
    .then(() => app.log.add(
      { type: 'UNKNOWN2' },
      { reasons: ['test'], user: '10', status: 'processed' })
    ).then(() => {
      expect(entries(app.log)).toEqual([
        [
          { type: 'UNKNOWN2' },
          {
            added: 2,
            id: [2, 'server', 0],
            time: 2,
            reasons: ['test'],
            user: '10',
            server: 'server',
            status: 'processed'
          }
        ],
        [
          { type: 'UNKNOWN1' },
          {
            added: 1,
            id: [1, 'server', 0],
            time: 1,
            reasons: ['test'],
            server: 'server',
            status: 'processed'
          }
        ]
      ])
    })
})

it('checks that user allow to send this action', () => {
  const test = createReporter()
  let deniedMeta
  test.app.type('FOO', {
    access (action, meta, user) {
      expect(action).toEqual({ type: 'FOO' })
      expect(meta.added).toEqual(1)
      expect(user).toEqual('server')
      deniedMeta = meta
      return false
    },
    process () {
      throw new Error('Should not be called')
    }
  })

  return test.app.log.add({ type: 'FOO' }, { reasons: ['test'] }).then(() => {
    expect(test.names).toEqual(['add', 'denied'])
    expect(test.reports[1]).toEqual([
      'denied', test.app, { type: 'FOO' }, deniedMeta
    ])
  })
})

it('supports Promise in access', () => {
  const test = createReporter()
  test.app.type('FOO', {
    access () {
      return Promise.resolve(false)
    },
    process () {
      throw new Error('Should not be called')
    }
  })

  return test.app.log.add({ type: 'FOO' }, { reasons: ['test'] }).then(() => {
    expect(test.names).toEqual(['add', 'denied'])
  })
})

it('processes actions', () => {
  const test = createReporter()
  const processed = []
  const fired = []

  test.app.type('FOO', {
    access () {
      return true
    },
    process (action, meta, user) {
      expect(meta.added).toEqual(1)
      expect(user).toEqual('server')
      processed.push(action)
    }
  })
  test.app.on('processed', (action, meta) => {
    expect(meta.added).toEqual(1)
    fired.push(action)
  })

  return test.app.log.add({ type: 'FOO' }, { reasons: ['test'] })
    .then(() => wait(1))
    .then(() => {
      expect(processed).toEqual([{ type: 'FOO' }])
      expect(fired).toEqual([{ type: 'FOO' }])
      expect(test.names).toEqual(['add', 'processed'])
      expect(test.reports[1][1]).toEqual(test.app)
      expect(test.reports[1][2]).toEqual({ type: 'FOO' })
      expect(test.reports[1][3].added).toEqual(1)
      expect(test.reports[1][4]).toBeCloseTo(0, -2)
    })
})

it('sends user ID to action callbacks', () => {
  const test = createReporter()

  test.app.type('FOO', {
    access (action, meta, user) {
      expect(user).toEqual('10')
    },
    process (action, meta, user) {
      expect(user).toEqual('10')
    }
  })

  return test.app.log.add({ type: 'FOO' }, {
    reasons: ['test'],
    id: [1, '10:uuid', 0]
  })
})

it('supports Promise in process', () => {
  const test = createReporter()
  const processed = []
  test.app.type('FOO', {
    access () {
      return wait(25).then(() => true)
    },
    process (action) {
      return wait(25).then(() => {
        processed.push(action)
      })
    }
  })

  return test.app.log.add({ type: 'FOO' }, { reasons: ['test'] })
    .then(() => wait(60))
    .then(() => {
      expect(processed).toEqual([{ type: 'FOO' }])
      expect(test.names).toEqual(['add', 'processed'])
      expect(test.reports[1][4]).toBeCloseTo(50, -2)
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

it('shows error', () => {
  const test = createReporter({
    subprotocol: '0.0.0',
    supports: '0.x',
    nodeId: 'server',
    env: 'development'
  })
  test.app.debugError = jest.fn()

  const error = new Error('Test')
  test.app.emitter.emit('error', error)

  expect(test.reports).toEqual([
    ['runtimeError', test.app, error, undefined, undefined]
  ])
  expect(test.app.debugError).toHaveBeenCalledWith(error)
})

it('does not send errors in non-development mode', () => {
  const test = createReporter()
  test.app.debugError = jest.fn()
  const error = new Error('Test')
  test.app.emitter.emit('error', error)
  expect(test.app.debugError).not.toHaveBeenCalledWith(error)
})

it('waits for last processing before destroy', () => {
  app = createServer()

  let processed = 0
  let started = 0
  let process
  let approve

  app.type('FOO', {
    access () {
      started += 1
      return new Promise(resolve => {
        approve = resolve
      })
    },
    process () {
      processed += 1
      return new Promise(resolve => {
        process = resolve
      })
    }
  })

  let destroyed = false
  return app.log.add({ type: 'FOO' }, { reasons: ['test'] }).then(() => {
    approve(true)
    return app.log.add({ type: 'FOO' }, { reasons: ['test'] })
  }).then(() => {
    app.destroy().then(() => {
      destroyed = true
    })
    return wait(1)
  }).then(() => {
    expect(destroyed).toBeFalsy()
    expect(app.processing).toEqual(1)
    return app.log.add({ type: 'FOO' }, { reasons: ['test'] })
  }).then(() => {
    expect(started).toEqual(2)
    approve(true)
    return wait(1)
  }).then(() => {
    expect(processed).toEqual(1)
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
    access (action) {
      if (action.auth) {
        throw error
      } else {
        return true
      }
    },
    process () {
      return new Promise((resolve, reject) => {
        reject(error)
      })
    }
  })

  let processed = 0
  app.on('processed', (action, meta) => {
    processed += 1
    expect(action).toEqual({ type: 'FOO' })
    expect(meta.added).toEqual(1)
  })

  return app.log.add({ type: 'FOO' }, { id: [1, 's', 0], reasons: ['test'] })
    .then(() => app.log.add({ type: 'FOO', auth: true },
                            { id: [2, 's', 0], reasons: ['test'] }))
    .then(() => wait(1))
    .then(() => {
      expect(processed).toEqual(1)
      expect(test.names).toEqual([
        'add', 'add', 'runtimeError',
        'add', 'runtimeError', 'add'
      ])
      expect(test.reports[2][2]).toEqual(error)
      expect(test.reports[2][3]).toEqual({ type: 'FOO' })
      expect(test.reports[2][4].added).toEqual(1)
      expect(test.reports[3][2]).toEqual({
        type: 'logux/undo', reason: 'error', id: [1, 's', 0]
      })
      expect(test.reports[4][2]).toEqual(error)
      expect(test.reports[5][2]).toEqual({
        type: 'logux/undo', reason: 'error', id: [2, 's', 0]
      })
    })
})
