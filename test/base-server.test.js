var MemoryStore = require('logux-core').MemoryStore
var WebSocket = require('ws')
var https = require('https')
var http = require('http')
var path = require('path')
var Log = require('logux-core').Log
var fs = require('fs')

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
  var created = new BaseServer(options || defaultOptions)
  created.auth(() => Promise.resolve(true))
  return created
}

var app, server

function createReporter () {
  var result = { }
  result.reports = []
  app = new BaseServer(defaultOptions, function () {
    result.reports.push(Array.prototype.slice.call(arguments, 0))
  })
  app.auth(() => Promise.resolve(true))
  result.app = app
  return result
}

var originArgv = process.argv
var originEnv = process.env.NODE_ENV

afterEach(() => {
  process.argv = originArgv
  process.env.NODE_ENV = originEnv

  delete process.env.LOGUX_HOST
  delete process.env.LOGUX_PORT
  delete process.env.LOGUX_KEY
  delete process.env.LOGUX_CERT

  return Promise.all([
    app ? app.destroy() : true,
    server ? promisify(done => server.close(done)) : true
  ]).then(() => {
    app = undefined
    server = undefined
  })
})

it('saves server options', () => {
  app = new BaseServer(defaultOptions)
  expect(app.options.supports).toEqual('0.x')
})

it('generates node ID', () => {
  app = new BaseServer(defaultOptions)
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
  app = new BaseServer(defaultOptions)
  expect(app.env).toEqual('development')
})

it('takes environment from NODE_ENV', () => {
  process.env.NODE_ENV = 'production'
  app = new BaseServer(defaultOptions)
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
  app = new BaseServer(defaultOptions)
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
  app = new BaseServer(defaultOptions)
  expect(app.log instanceof Log).toBeTruthy()
  expect(app.log.store instanceof MemoryStore).toBeTruthy()
})

it('creates log with custom store', () => {
  var store = new MemoryStore()
  app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    store
  })
  expect(app.log.store).toBe(store)
})

it('destroys application without runned server', () => {
  app = new BaseServer(defaultOptions)
  return app.destroy().then(() => app.destroy())
})

it('throws without authenticator', () => {
  app = new BaseServer(defaultOptions)
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

it('uses cli args for options', () => {
  app = createServer()

  var cliArgs = ['', '--port', '31337', '--host', '192.168.1.1']

  process.argv = process.argv.concat(cliArgs)
  var options = app.loadOptions(process)

  expect(options.host).toEqual('192.168.1.1')
  expect(options.port).toEqual(31337)
  expect(options.cert).toBeUndefined()
  expect(options.key).toBeUndefined()
})

it('uses env for options', () => {
  process.env.LOGUX_HOST = '127.0.1.1'
  process.env.LOGUX_PORT = 31337

  app = createServer()
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

  app = createServer()
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
  app = createServer()

  var cliArgs = ['', '--port', '31337']
  process.argv = process.argv.concat(cliArgs)

  process.env.LOGUX_PORT = 21337

  var options = app.loadOptions(process, {
    port: 11337
  })

  expect(options.port).toEqual(31337)
})

it('throws a error on key without certificate', () => {
  app = createServer()
  expect(() => {
    app.listen({
      key: fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
    })
  }).toThrowError(/set cert option/)
})

it('throws a error on certificate without key', () => {
  app = createServer()
  expect(() => {
    app.listen({
      cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem'))
    })
  }).toThrowError(/set key option/)
})

it('uses HTTPS', () => {
  app = createServer()
  return app.listen({
    port: uniqPort(),
    cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem')),
    key: fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
  }).then(() => {
    expect(app.http instanceof https.Server).toBeTruthy()
  })
})

it('loads keys by absolute path', () => {
  app = createServer()
  return app.listen({
    cert: path.join(__dirname, 'fixtures/cert.pem'),
    key: path.join(__dirname, 'fixtures/key.pem'),
    port: uniqPort()
  }).then(() => {
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
  var test = createReporter()

  var promise = test.app.listen({ port: uniqPort() })
  expect(test.reports).toEqual([])

  return promise.then(() => {
    expect(test.reports).toEqual([['listen', test.app]])
  })
})

it('reporters on destroing', () => {
  var test = createReporter()

  var promise = test.app.destroy()
  expect(test.reports).toEqual([['destroy', test.app]])

  return promise
})

it('creates a client on connection', () => {
  app = createServer()
  return app.listen({ port: uniqPort() }).then(() => {
    var ws = new WebSocket(`ws://localhost:${ app.listenOptions.port }`)
    return new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
  }).then(() => {
    expect(Object.keys(app.clients).length).toBe(1)
    var client = app.clients[1]
    expect(client.remoteAddress).toEqual('127.0.0.1')
  })
})

it('send debug message to clients on runtimeError', () => {
  app = createServer()
  app.clients[1] = { connection: { send: jest.fn() }, destroy: jest.fn() }

  var error = new Error('Test Error')
  error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`

  app.debugError(error)
  expect(app.clients[1].connection.send).toBeCalledWith([
        'debug',
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
  var test = createReporter()

  var port = uniqPort()
  server = http.createServer()

  return promisify(done => {
    server.listen(port, done)
  }).then(() => test.app.listen({ server })).then(() => {
    var ws = new WebSocket(`ws://localhost:${ port }`)
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
  var added = []
  app.log.on('add', (action, meta) => {
    added.push(meta.server)
  })

  return Promise.all([
    app.log.add({ type: 'A' }, { reasons: ['test'] }),
    app.log.add({ type: 'B' }, { reasons: ['test'], server: 'server2' })
  ]).then(() => {
    expect(added).toEqual([app.options.nodeId, 'server2'])
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
