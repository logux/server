#!/usr/bin/env node

var Server = require('../../server')
new Server({
  env: 'test',
  uniqName: 'server',
  subprotocol: [1, 0],
  supports: [1]
})

setTimeout(function () {
  throw new Error('Test Error')
}, 10)
