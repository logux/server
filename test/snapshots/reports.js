var ServerConnection = require('logux-sync').ServerConnection
var createServer = require('http').createServer
var SyncError = require('logux-sync').SyncError
var path = require('path')

var BaseServer = require('../../base-server')
var Client = require('../../client')

var app = new BaseServer({
  env: 'development',
  pid: 21384,
  nodeId: 'server:H1f8LAyzl',
  subprotocol: '2.5.0',
  supports: '2.x || 1.x'
})
app.listenOptions = { host: '127.0.0.1', port: 1337 }

var wss = new BaseServer({
  env: 'production',
  pid: 21384,
  nodeId: 'server:H1f8LAyzl',
  subprotocol: '1.0.0',
  supports: '1.x'
})
wss.listenOptions = { cert: 'A', host: '0.0.0.0', port: 1337 }

var http = new BaseServer({
  env: 'development',
  pid: 21384,
  nodeId: 'server:H1f8LAyzl',
  subprotocol: '1.0.0',
  supports: '1.x'
})
http.listenOptions = { server: createServer() }

var ws = {
  upgradeReq: {
    headers: { },
    connection: {
      remoteAddress: '127.0.0.1'
    }
  },
  on: function () { }
}

var authed = new Client(app, new ServerConnection(ws), 1)
authed.sync.otherSubprotocol = '1.0.0'
authed.sync.otherProtocol = [0, 0]
authed.user = { id: 100 }
authed.nodeId = '100:550e8400-e29b-41d4-a716-446655440000'

var unauthed = new Client(app, new ServerConnection(ws), 1)

var file = path.join(__dirname, 'reports.js')
var jest = path.join(__dirname, '..', '..', 'node_modules', 'jest', 'index.js')
var error = new Error('Some mistake')
error.stack = error.name + ': ' + error.message + '\n' +
'    at Object.<anonymous> (' + file + ':28:13)\n' +
'    at Module._compile (module.js:573:32)\n' +
'    at at runTest (' + jest + ':50:10)\n' +
'    at process._tickCallback (internal/process/next_tick.js:103:7)'

var ownError = new SyncError(authed.sync, 'timeout', 5000, false)
var clientError = new SyncError(authed.sync, 'timeout', 5000, true)

module.exports = {
  'listen': ['listen', app],
  'production': ['listen', wss],
  'http': ['listen', http],
  'connect': ['connect', app, '127.0.0.1'],
  'authenticated': ['authenticated', app, authed],
  'disconnect': ['disconnect', app, authed],
  'expel': ['disconnect', app, unauthed],
  'error': ['runtimeError', app, undefined, error],
  'client-error': ['clientError', app, authed, clientError],
  'authed-error': ['syncError', app, authed, ownError],
  'unauthed-error': ['syncError', app, unauthed, clientError],
  'destroy': ['destroy', app]
}
