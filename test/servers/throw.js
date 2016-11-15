#!/usr/bin/env node

var Server = require('../../server')

new Server({
  env: 'test',
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

setTimeout(function () {
  var error = new Error('Test Error')
  error.stack = error.stack.split('\n')[0] + '\nfake stacktrace'
  throw error
}, 10)
