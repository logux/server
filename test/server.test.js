/* eslint-disable no-invalid-this */
var EventEmitter = require('events')
var https = require('https')
var path = require('path')
var fs = require('fs')

var Server = require('../server')

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

it('sets development environment by default', function () {
  delete process.env.NODE_ENV
  var app = new Server()
  expect(app.env).toEqual('development')
})

it('takes environment from NODE_ENV', function () {
  process.env.NODE_ENV = 'production'
  var app = new Server()
  expect(app.env).toEqual('production')
})

it('sets environment from user', function () {
  var app = new Server('production')
  expect(app.env).toEqual('production')
})

it('destroys application without runned server', function () {
  var app = new Server()
  return app.destroy().then(function () {
    return app.destroy()
  })
})

it('uses 1337 port by default', function () {
  this.app = new Server()
  this.app.listen()
  expect(this.app.options.port).toEqual(1337)
})

it('uses user port', function () {
  this.app = new Server()
  this.app.listen({ port: 31337 })
  expect(this.app.options.port).toEqual(31337)
})

it('uses 127.0.0.1 to bind server by default', function () {
  this.app = new Server()
  this.app.listen({ port: uniqPort() })
  expect(this.app.options.host).toEqual('127.0.0.1')
})

it('throws a error on no security in production', function () {
  var app = new Server('production')
  expect(function () {
    app.listen({ port: uniqPort() })
  }).toThrowError(/SSL/)
})

it('accepts custom HTTP server', function () {
  var http = new EventEmitter()
  http.on = jest.fn()
  this.app = new Server()
  this.app.listen({ server: http })
  expect(http.on).toBeCalled()
})

it('uses HTTPS', function () {
  this.app = new Server()
  this.app.listen({
    cert: fs.readFileSync(path.join(__dirname, 'fixtures/cert.pem')),
    key: fs.readFileSync(path.join(__dirname, 'fixtures/key.pem'))
  })
  expect(this.app.http instanceof https.Server).toBeTruthy()
})
