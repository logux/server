var createServer = require('http').createServer
var BaseServer = require('../../base-server')
var path = require('path')

var app = new BaseServer({
  env: 'development',
  uniqName: 'server',
  subprotocol: [2, 5],
  supports: [2, 1]
})
app.listenOptions = { host: '127.0.0.1', port: 1337 }

var wss = new BaseServer({
  env: 'production',
  uniqName: 'server',
  subprotocol: [1, 0],
  supports: [1]
})
wss.listenOptions = { cert: 'A', host: '0.0.0.0', port: 1337 }

var http = new BaseServer({
  env: 'development',
  uniqName: 'server',
  subprotocol: [1, 0],
  supports: [1]
})
http.listenOptions = { server: createServer() }

var file = path.join(__dirname, 'reports.js')
var jest = path.join(__dirname, '..', '..', 'node_modules', 'jest', 'index.js')
var error = new Error('Some mistake')
error.stack = error.name + ': ' + error.message + '\n' +
'    at Object.<anonymous> (' + file + ':28:13)\n' +
'    at Module._compile (module.js:573:32)\n' +
'    at at runTest (' + jest + ':50:10)\n' +
'    at process._tickCallback (internal/process/next_tick.js:103:7)'

module.exports = {
  listen: ['listen', app],
  production: ['listen', wss],
  http: ['listen', http],
  error: ['runtimeError', app, error],
  destroy: ['destroy', app]
}
