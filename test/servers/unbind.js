#!/usr/bin/env node

var Server = require('../../server')

var app = new Server({
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

app.destroy()

setTimeout(() => { }, 10000)
