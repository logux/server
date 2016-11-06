/* eslint-disable no-invalid-this */
var createTestTimer = require('logux-core').createTestTimer
var EventEmitter = require('events')
var MemoryStore = require('logux-core').MemoryStore
var https = require('https')
var path = require('path')
var Log = require('logux-core').Log
var fs = require('fs')

var BaseServer = require('../base-server')

var lastPort = 9111
function uniqPort () {
  lastPort += 1
  return lastPort
}

var originEnv = process.env.NODE_ENV
afterEach(function () {
  process.env.NODE_ENV = originEnv
  return this.app ? this.app.destroy() : undefined
})

it('saves server options', function () {
  var app = new BaseServer({ uniqName: 'server' })
  expect(app.options).toEqual({ uniqName: 'server' })
})

it('throws on empty host name', function () {
  expect(function () {
    new BaseServer()
  }).toThrowError(/unique node name/)
})

it('sets development environment by default', function () {
  delete process.env.NODE_ENV
  var app = new BaseServer({ uniqName: 'server' })
  expect(app.env).toEqual('development')
})

it('takes environment from NODE_ENV', function () {
  process.env.NODE_ENV = 'production'
  var app = new BaseServer({ uniqName: 'server' })
  expect(app.env).toEqual('production')
})

it('sets environment from user', function () {
  var app = new BaseServer({ uniqName: 'server', env: 'production' })
  expect(app.env).toEqual('production')
})

it('creates log with default timer and store', function () {
  var app = new BaseServer({ uniqName: 'server' })
  expect(app.log instanceof Log).toBeTruthy()
  expect(app.log.store instanceof MemoryStore).toBeTruthy()
  var time = app.log.timer()
  expect(typeof time[0]).toEqual('number')
  expect(time[1]).toEqual('server')
  expect(time[2]).toEqual(0)
})

it('creates log with custom timer and store', function () {
  var timer = createTestTimer()
  var store = new MemoryStore()
  var app = new BaseServer({ uniqName: 'server', store: store, timer: timer })
  expect(app.log.store).toBe(store)
  expect(app.log.timer).toBe(timer)
})

it('destroys application without runned server', function () {
  var app = new BaseServer({ uniqName: 'server' })
  return app.destroy().then(function () {
    return app.destroy()
  })
})

it('uses 1337 port by default', function () {
  this.app = new BaseServer({ uniqName: 'server' })
  this.app.listen()
  expect(this.app.listenOptions.port).toEqual(1337)
})

it('uses user port', function () {
  this.app = new BaseServer({ uniqName: 'server' })
  this.app.listen({ port: 31337 })
  expect(this.app.listenOptions.port).toEqual(31337)
})

it('uses 127.0.0.1 to bind server by default', function () {
  this.app = new BaseServer({ uniqName: 'server' })
  this.app.listen({ port: uniqPort() })
  expect(this.app.listenOptions.host).toEqual('127.0.0.1')
})

it('throws a error on key without certificate', function () {
  var app = new BaseServer({ uniqName: 'server' })
  expect(function () {
    app.listen({
      key: fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
    })
  }).toThrowError(/set cert option/)
})

it('throws a error on certificate without key', function () {
  var app = new BaseServer({ uniqName: 'server' })
  expect(function () {
    app.listen({
      cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem'))
    })
  }).toThrowError(/set key option/)
})

it('throws a error on no security in production', function () {
  var app = new BaseServer({ uniqName: 'server', env: 'production' })
  expect(function () {
    app.listen({ port: uniqPort() })
  }).toThrowError(/SSL/)
})

it('accepts custom HTTP server', function () {
  var http = new EventEmitter()
  http.on = jest.fn()
  this.app = new BaseServer({ uniqName: 'server' })
  this.app.listen({ server: http })
  expect(http.on).toBeCalled()
})

it('uses HTTPS', function () {
  this.app = new BaseServer({ uniqName: 'server' })
  this.app.listen({
    cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem')),
    key: fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
  })
  expect(this.app.http instanceof https.Server).toBeTruthy()
})

it('reporters on start listening', function () {
  var reports = []
  var server = new BaseServer({ uniqName: 'server' }, function (type, app) {
    reports.push(type, app)
  })
  this.app = server

  expect(reports).toEqual([])

  var promise = this.app.listen({ port: uniqPort() })
  expect(reports).toEqual([])

  return promise.then(function () {
    expect(reports).toEqual(['listen', server])
  })
})

it('reporters on destroing', function () {
  var reports = []
  var server = new BaseServer({ uniqName: 'server' }, function (type, app) {
    reports.push(type, app)
  })

  var promise = server.destroy()
  expect(reports).toEqual(['destroy', server])

  return promise
})
