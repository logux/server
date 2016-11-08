#!/usr/bin/env node

var Server = require('../../server')
var app = new Server({
  env: 'test',
  nodeId: 'server',
  subprotocol: [1, 0],
  supports: [1]
})

app.destroy()

setTimeout(function () { }, 10000)
