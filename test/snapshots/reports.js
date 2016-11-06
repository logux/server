var BaseServer = require('../../base-server')

var app = new BaseServer({ uniqName: 'server', env: 'development' })
app.listenOptions = { host: '127.0.0.1', port: 1337 }

var wss = new BaseServer({ uniqName: 'server', env: 'production' })
wss.listenOptions = { cert: 'A', host: '0.0.0.0', port: 1337 }

module.exports = {
  listen: ['listen', app],
  wss: ['listen', wss]
}
