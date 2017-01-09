#!/usr/bin/env node
var fs = require('fs')
var path = require('path')
var Server = require('../../server')

var app = new Server({
  env: 'test',
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

var defaults = {
  port: '1337',
  host: '127.0.0.1',
  key: fs.readFileSync(path.join(__dirname, '../fixtures/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../fixtures/cert.pem'))
}

app.auth(function () {
  return Promise.resolve(true)
})

var options = app.loadOptions(process, defaults)
app.listen(options)

setTimeout(function () {
  app.destroy()
}, 10)
