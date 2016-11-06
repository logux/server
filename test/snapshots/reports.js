var createServer = require('http').createServer
var BaseServer = require('../../base-server')

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
  uniqName: 'server',
  subprotocol: [1, 0],
  supports: [1]
})
http.listenOptions = { server: createServer() }

module.exports = {
  listen: ['listen', app],
  production: ['listen', wss],
  http: ['listen', http],
  destroy: ['destroy', app]
}
