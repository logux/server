/* eslint-disable no-invalid-this */

var MemoryStore = require('logux-core').MemoryStore
var WebSocket = require('ws')
var https = require('https')
var http = require('http')
var path = require('path')
var Log = require('logux-core').Log
var fs = require('fs')
var shortid = require('shortid')

var BaseServer = require('../base-server')
var promisify = require('../promisify')

var lastPort = 9111
function uniqPort () {
  lastPort += 1
  return lastPort
}

var defaultOptions = {
  subprotocol: '0.0.0',
  supports: '0.x'
}

function createServer (options) {
  var server = new BaseServer(options || defaultOptions)
  server.auth(() => {
    return Promise.resolve(true)
  })
  return server
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

var originArgv = process.argv
var originEnv = process.env.NODE_ENV

describe('Base server test', () => {
  beforeAll(() => {
    this.tests = {}
  })
  beforeEach(() => {
    var testId = shortid.generate()
    this.currentTest = testId
    this.tests[testId] = {}
  })

  afterEach(() => {
    process.argv = originArgv
    process.env.NODE_ENV = originEnv
    delete process.env.LOGUX_HOST
    delete process.env.LOGUX_PORT
    delete process.env.LOGUX_KEY
    delete process.env.LOGUX_CERT
    var test = this.tests[this.currentTest]

    var promise = test.app ? test.app.destroy() : Promise.resolve()
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
    var app = new BaseServer(defaultOptions)
    expect(app.options.supports).toEqual('0.x')
  })

  it('generates node ID', () => {
    var app = new BaseServer(defaultOptions)
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
    var app = new BaseServer(defaultOptions)
    expect(app.env).toEqual('development')
  })

  it('takes environment from NODE_ENV', () => {
    process.env.NODE_ENV = 'production'
    var app = new BaseServer(defaultOptions)
    expect(app.env).toEqual('production')
  })

  it('sets environment from user', () => {
    var app = new BaseServer({
      env: 'production',
      subprotocol: '0.0.0',
      supports: '0.x'
    })
    expect(app.env).toEqual('production')
  })

  it('uses cwd as default root', () => {
    var app = new BaseServer(defaultOptions)
    expect(app.options.root).toEqual(process.cwd())
  })

  it('uses user root', () => {
    var app = new BaseServer({
      subprotocol: '0.0.0',
      supports: '0.x',
      root: '/a'
    })
    expect(app.options.root).toEqual('/a')
  })

  it('creates log with default store', () => {
    var app = new BaseServer(defaultOptions)
    expect(app.log instanceof Log).toBeTruthy()
    expect(app.log.store instanceof MemoryStore).toBeTruthy()
  })

  it('creates log with custom store', () => {
    var store = new MemoryStore()
    var app = new BaseServer({
      subprotocol: '0.0.0',
      supports: '0.x',
      store: store
    })
    expect(app.log.store).toBe(store)
  })

  it('destroys application without runned server', () => {
    var app = new BaseServer(defaultOptions)
    return app.destroy().then(() => {
      return app.destroy()
    })
  })

  it('throws without authenticator', () => {
    var app = new BaseServer(defaultOptions)
    expect(() => {
      app.listen()
    }).toThrowError(/authentication/)
  })

  it('uses 1337 port by default', () => {
    var test = this.tests[this.currentTest]
    test.app = createServer()
    test.app.listen()
    expect(test.app.listenOptions.port).toEqual(1337)
  })

  it('uses user port', () => {
    var test = this.tests[this.currentTest]
    test.app = createServer()
    test.app.listen({ port: 31337 })
    expect(test.app.listenOptions.port).toEqual(31337)
  })

  it('uses 127.0.0.1 to bind server by default', () => {
    var test = this.tests[this.currentTest]
    test.app = createServer()
    test.app.listen({ port: uniqPort() })
    expect(test.app.listenOptions.host).toEqual('127.0.0.1')
  })

  it('uses cli args for options', () => {
    var origArgv = process.argv

    var app = createServer()

    var cliArgs = ['', '--port', '31337', '--host', '192.168.1.1']

    process.argv = process.argv.concat(cliArgs)
    var options = app.loadOptions(process)
    process.argv = origArgv

    expect(options.host).toEqual('192.168.1.1')
    expect(options.port).toEqual(31337)
    expect(options.cert).toBeUndefined()
    expect(options.key).toBeUndefined()
  })

  it('uses env for options', () => {
    process.env.LOGUX_HOST = '127.0.1.1'
    process.env.LOGUX_PORT = 31337

    var app = createServer()
    var options = app.loadOptions(process)

    expect(options.host).toEqual('127.0.1.1')
    expect(options.port).toEqual(31337)
  })

  it('uses combined options', () => {
    var certPath = path.join(__dirname, 'fixtures/cert.pem')
    process.env.LOGUX_CERT = certPath

    var keyPath = path.join(__dirname, 'fixtures/key.pem')
    var cliArgs = ['', '--key', keyPath]
    process.argv = process.argv.concat(cliArgs)

    var app = createServer()
    var options = app.loadOptions(process, {
      host: '127.0.1.1',
      port: 31337
    })

    expect(options.host).toEqual('127.0.1.1')
    expect(options.port).toEqual(31337)
    expect(options.cert).toEqual(certPath)
    expect(options.key).toEqual(keyPath)
  })

  it('uses arg, env, defaults options in given priority', () => {
    var app = createServer()

    var cliArgs = ['', '--port', '31337']
    process.argv = process.argv.concat(cliArgs)

    process.env.LOGUX_PORT = 21337

    var options = app.loadOptions(process, {
      port: 11337
    })

    expect(options.port).toEqual(31337)
  })

  it('throws a error on key without certificate', () => {
    var app = createServer()
    expect(() => {
      app.listen({
        key: fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
      })
    }).toThrowError(/set cert option/)
  })

  it('throws a error on certificate without key', () => {
    var app = createServer()
    expect(() => {
      app.listen({
        cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem'))
      })
    }).toThrowError(/set key option/)
  })

  it('uses HTTPS', () => {
    var test = this.tests[this.currentTest]
    var app = createServer()
    test.app = app
    return app.listen({
      port: uniqPort(),
      cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem')),
      key: fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
    }).then(() => {
      expect(app.http instanceof https.Server).toBeTruthy()
    })
  })

  it('loads keys by absolute path', () => {
    var test = this.tests[this.currentTest]
    var app = createServer()
    test.app = app
    return app.listen({
      cert: path.join(__dirname, 'fixtures/cert.pem'),
      key: path.join(__dirname, 'fixtures/key.pem'),
      port: uniqPort()
    }).then(() => {
      expect(app.http instanceof https.Server).toBeTruthy()
    })
  })

  it('loads keys by relative path', () => {
    var test = this.tests[this.currentTest]
    var app = createServer({
      subprotocol: '0.0.0',
      supports: '0.x',
      root: __dirname
    })
    test.app = app
    return app.listen({
      cert: 'fixtures/cert.pem',
      key: 'fixtures/key.pem',
      port: uniqPort()
    }).then(() => {
      expect(app.http instanceof https.Server).toBeTruthy()
    })
  })

  it('supports object in SSL key', () => {
    var test = this.tests[this.currentTest]
    var app = createServer()
    test.app = app
    var key = fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
    return app.listen({
      cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem')),
      key: { pem: key },
      port: uniqPort()
    }).then(() => {
      expect(app.http instanceof https.Server).toBeTruthy()
    })
  })

  it('reporters on start listening', () => {
    var test = this.tests[this.currentTest]
    createReporter(test)

    var promise = test.app.listen({ port: uniqPort() })
    expect(test.reports).toEqual([])

    return promise.then(() => {
      expect(test.reports).toEqual([['listen', test.app]])
    })
  })

  it('reporters on destroing', () => {
    var test = this.tests[this.currentTest]
    createReporter(test)

    var promise = test.app.destroy()
    expect(test.reports).toEqual([['destroy', test.app]])

    return promise
  })

  it('creates a client on connection', () => {
    var test = this.tests[this.currentTest]
    createReporter(test)

    return test.app.listen({ port: uniqPort() }).then(() => {
      test.reports = []

      var ws = new WebSocket(`ws://localhost:${ test.app.listenOptions.port }`)
      return new Promise((resolve, reject) => {
        ws.onopen = resolve
        ws.onerror = reject
      })
    }).then(() => {
      expect(Object.keys(test.app.clients).length).toBe(1)

      var client = test.app.clients[1]
      expect(client.remoteAddress).toEqual('127.0.0.1')
      expect(test.reports).toEqual([['connect', test.app, '127.0.0.1']])
    })
  })

  it('accepts custom HTTP server', () => {
    var test = this.tests[this.currentTest]
    createReporter(test)
    var port = uniqPort()
    test.server = http.createServer()

    return promisify(done => {
      test.server.listen(port, done)
    }).then(() => {
      return test.app.listen({ server: test.server })
    }).then(() => {
      test.reports = []

      var ws = new WebSocket(`ws://localhost:${ port }`)
      return new Promise((resolve, reject) => {
        ws.onopen = resolve
        ws.onerror = reject
      })
    }).then(() => {
      expect(Object.keys(test.app.clients).length).toBe(1)
    })
  })

  it('disconnects on clients on destroy', () => {
    var app = createServer()
    app.clients[1] = { destroy: jest.fn() }
    app.destroy()
    expect(app.clients[1].destroy).toBeCalled()
  })
})
