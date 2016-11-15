#!/usr/bin/env node

var Server = require('../../server')

var app = new Server({
  env: 'test',
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

app.destroy()

setTimeout(function () { }, 10000)
