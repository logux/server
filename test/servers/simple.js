#!/usr/bin/env node

var Server = require('../../server')
var app = new Server({
  uniqName: 'server',
  subprotocol: [1, 0],
  supports: [1]
})

app.listen()
