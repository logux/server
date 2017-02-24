'use strict'

const MemoryStore = require('logux-core').MemoryStore
const WebSocket = require('ws')
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

function createServer (options) {
  const created = new BaseServer(options || DEFAULT_OPTIONS)
  created.auth(() => Promise.resolve(true))
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

function createReporter () {
  const result = { }
  result.reports = []
  app = new BaseServer(DEFAULT_OPTIONS, function () {
    result.reports.push(Array.prototype.slice.call(arguments, 0))
  })
  app.auth(() => Promise.resolve(true))
  result.app = app
  return result
}

function entries (log) {
  return log.store.created.map(i => [i[0], i[1]])
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
  app.listen()
  expect(app.listenOptions.port).toEqual(1337)
})

it('uses user port', () => {
  app = createServer()
  app.listen({ port: 31337 })
  expect(app.listenOptions.port).toEqual(31337)
})

it('uses 127.0.0.1 to bind server by default', () => {
  app = createServer()
  app.listen({ port: uniqPort() })
  expect(app.listenOptions.host).toEqual('127.0.0.1')
})

it('throws a error on key without certificate', () => {
  app = createServer()
  expect(() => {
    app.listen({
      key: fs.readFileSync(KEY)
    })
  }).toThrowError(/set cert option/)
})

it('throws a error on certificate without key', () => {
  app = createServer()
  expect(() => {
    app.listen({
      cert: fs.readFileSync(CERT)
    })
  }).toThrowError(/set key option/)
})

it('uses HTTPS', () => {
  app = createServer()
  return app.listen({
    port: uniqPort(),
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY)
  }).then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('loads keys by absolute path', () => {
  app = createServer()
  return app.listen({ cert: CERT, key: KEY, port: uniqPort() }).then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('loads keys by relative path', () => {
  app = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    root: __dirname
  })
  return app.listen({
    cert: 'fixtures/cert.pem',
    key: 'fixtures/key.pem',
    port: uniqPort()
  }).then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('supports object in SSL key', () => {
  app = createServer()
  return app.listen({
    cert: fs.readFileSync(CERT),
    key: { pem: fs.readFileSync(KEY) },
    port: uniqPort()
  }).then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('reporters on start listening', () => {
  const test = createReporter()

  const promise = test.app.listen({ port: uniqPort() })
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
  app = createServer()
  return app.listen({ port: uniqPort() }).then(() => {
    const ws = new WebSocket(`ws://localhost:${ app.listenOptions.port }`)
    return new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
  }).then(() => {
    expect(Object.keys(app.clients).length).toBe(1)
    const client = app.clients[1]
    expect(client.remoteAddress).toEqual('127.0.0.1')
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
  const test = createReporter()

  const port = uniqPort()
  server = http.createServer()

  return promisify(done => {
    server.listen(port, done)
  }).then(() => test.app.listen({ server })).then(() => {
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
      return new Promise()
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
  expect(app.actions.FOO).not.toBeUndefined()
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
        { type: 'logux/undo', reason: 'unknowType' },
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
