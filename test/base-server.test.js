/* eslint-disable no-invalid-this */

const MemoryStore = require('logux-core').MemoryStore
const WebSocket = require('ws')
const https = require('https')
const http = require('http')
const path = require('path')
const Log = require('logux-core').Log
const fs = require('fs')

const BaseServer = require('../base-server')
const promisify = require('../promisify')

let lastPort = 9111
function uniqPort () {
  lastPort += 1
  return lastPort
}

const defaultOptions = {
  subprotocol: '0.0.0',
  supports: '0.x'
}

function createServer (options) {
  const app = new BaseServer(options || defaultOptions)
  app.auth(() => {
    return Promise.resolve(true)
  })
  return app
}

function createReporter (test) {
  test.reports = []
  test.app = new BaseServer(defaultOptions, function () {
    test.reports.push(Array.prototype.slice.call(arguments, 0))
  })
  test.app.auth(() => {
    return Promise.resolve(true)
  })
}

const originArgv = process.argv
const originEnv = process.env.NODE_ENV
afterEach(function () {
  process.argv = originArgv
  process.env.NODE_ENV = originEnv
  delete process.env.LOGUX_HOST
  delete process.env.LOGUX_PORT
  delete process.env.LOGUX_KEY
  delete process.env.LOGUX_CERT
  const test = this

  const promise = test.app ? test.app.destroy() : Promise.resolve()
  return promise.then(() => {
    if (test.server) {
      return promisify(done => {
        test.server.close(done)
      })
    } else {
      return true
    }
  })
})

it('saves server options', () => {
  const app = new BaseServer(defaultOptions)
  expect(app.options.supports).toEqual('0.x')
})

it('generates node ID', () => {
  const app = new BaseServer(defaultOptions)
  expect(app.options.nodeId).toMatch(/server:[\w\d]+/)
  expect(app.options.nodeId).toEqual(app.log.nodeId)
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
  const app = new BaseServer(defaultOptions)
  expect(app.env).toEqual('development')
})

it('takes environment from NODE_ENV', () => {
  process.env.NODE_ENV = 'production'
  const app = new BaseServer(defaultOptions)
  expect(app.env).toEqual('production')
})

it('sets environment from user', () => {
  const app = new BaseServer({
    env: 'production',
    subprotocol: '0.0.0',
    supports: '0.x'
  })
  expect(app.env).toEqual('production')
})

it('uses cwd as default root', () => {
  const app = new BaseServer(defaultOptions)
  expect(app.options.root).toEqual(process.cwd())
})

it('uses user root', () => {
  const app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    root: '/a'
  })
  expect(app.options.root).toEqual('/a')
})

it('creates log with default store', () => {
  const app = new BaseServer(defaultOptions)
  expect(app.log instanceof Log).toBeTruthy()
  expect(app.log.store instanceof MemoryStore).toBeTruthy()
})

it('creates log with custom store', () => {
  const store = new MemoryStore()
  const app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    store: store
  })
  expect(app.log.store).toBe(store)
})

it('destroys application without runned server', () => {
  const app = new BaseServer(defaultOptions)
  return app.destroy().then(() => {
    return app.destroy()
  })
})

it('throws without authenticator', () => {
  const app = new BaseServer(defaultOptions)
  expect(() => {
    app.listen()
  }).toThrowError(/authentication/)
})

it('uses 1337 port by default', () => {
  this.app = createServer()
  this.app.listen()
  expect(this.app.listenOptions.port).toEqual(1337)
})

it('uses user port', () => {
  this.app = createServer()
  this.app.listen({ port: 31337 })
  expect(this.app.listenOptions.port).toEqual(31337)
})

it('uses 127.0.0.1 to bind server by default', () => {
  this.app = createServer()
  this.app.listen({ port: uniqPort() })
  expect(this.app.listenOptions.host).toEqual('127.0.0.1')
})

it('uses cli args for options', () => {
  const origArgv = process.argv

  const app = createServer()

  const cliArgs = ['', '--port', '31337', '--host', '192.168.1.1']

  process.argv = process.argv.concat(cliArgs)
  const options = app.loadOptions(process)
  process.argv = origArgv

  expect(options.host).toEqual('192.168.1.1')
  expect(options.port).toEqual(31337)
  expect(options.cert).toBeUndefined()
  expect(options.key).toBeUndefined()
})

it('uses env for options', () => {
  process.env.LOGUX_HOST = '127.0.1.1'
  process.env.LOGUX_PORT = 31337

  const app = createServer()
  const options = app.loadOptions(process)

  expect(options.host).toEqual('127.0.1.1')
  expect(options.port).toEqual(31337)
})

it('uses combined options', () => {
  const certPath = path.join(__dirname, 'fixtures/cert.pem')
  process.env.LOGUX_CERT = certPath

  const keyPath = path.join(__dirname, 'fixtures/key.pem')
  const cliArgs = ['', '--key', keyPath]
  process.argv = process.argv.concat(cliArgs)

  const app = createServer()
  const options = app.loadOptions(process, {
    host: '127.0.1.1',
    port: 31337
  })

  expect(options.host).toEqual('127.0.1.1')
  expect(options.port).toEqual(31337)
  expect(options.cert).toEqual(certPath)
  expect(options.key).toEqual(keyPath)
})

it('uses arg, env, defaults options in given priority', () => {
  const app = createServer()

  const cliArgs = ['', '--port', '31337']
  process.argv = process.argv.concat(cliArgs)

  process.env.LOGUX_PORT = 21337

  const options = app.loadOptions(process, {
    port: 11337
  })

  expect(options.port).toEqual(31337)
})

it('throws a error on key without certificate', () => {
  const app = createServer()
  expect(() => {
    app.listen({
      key: fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
    })
  }).toThrowError(/set cert option/)
})

it('throws a error on certificate without key', () => {
  const app = createServer()
  expect(() => {
    app.listen({
      cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem'))
    })
  }).toThrowError(/set key option/)
})

it('uses HTTPS', () => {
  const app = createServer()
  this.app = app
  return app.listen({
    port: 2002,
    cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem')),
    key: fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
  }).then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('loads keys by absolute path', function () {
  const app = createServer()
  this.app = app
  return app.listen({
    cert: path.join(__dirname, 'fixtures/cert.pem'),
    key: path.join(__dirname, 'fixtures/key.pem')
  }).then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('loads keys by relative path', function () {
  const app = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    root: __dirname
  })
  this.app = app
  return app.listen({
    cert: 'fixtures/cert.pem',
    key: 'fixtures/key.pem'
  }).then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('supports object in SSL key', function () {
  const app = createServer()
  this.app = app
  const key = fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
  return app.listen({
    cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem')),
    key: { pem: key }
  }).then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('reporters on start listening', function () {
  createReporter(this)
  const test = this

  const promise = this.app.listen({ port: uniqPort() })
  expect(this.reports).toEqual([])

  return promise.then(() => {
    expect(test.reports).toEqual([['listen', test.app]])
  })
})

it('reporters on destroing', function () {
  createReporter(this)

  const promise = this.app.destroy()
  expect(this.reports).toEqual([['destroy', this.app]])

  return promise
})

it('creates a client on connection', function () {
  createReporter(this)
  const test = this

  return test.app.listen({ port: uniqPort() }).then(() => {
    test.reports = []

    const ws = new WebSocket('ws://localhost:' + test.app.listenOptions.port)
    return new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
  }).then(() => {
    expect(Object.keys(test.app.clients).length).toBe(1)

    const client = test.app.clients[1]
    expect(client.remoteAddress).toEqual('127.0.0.1')
    expect(test.reports).toEqual([['connect', test.app, '127.0.0.1']])
  })
})

it('accepts custom HTTP server', function () {
  createReporter(this)
  const test = this
  const port = uniqPort()
  test.server = http.createServer()

  return promisify(done => {
    test.server.listen(port, done)
  }).then(() => {
    return test.app.listen({ server: test.server })
  }).then(() => {
    test.reports = []

    const ws = new WebSocket('ws://localhost:' + port)
    return new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
  }).then(() => {
    expect(Object.keys(test.app.clients).length).toBe(1)
  })
})

it('disconnects on clients on destroy', () => {
  const app = createServer()
  app.clients[1] = { destroy: jest.fn() }
  app.destroy()
  expect(app.clients[1].destroy).toBeCalled()
})
