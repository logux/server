#!/usr/bin/env node

var Server = require('../../server')
new Server({
  env: 'test',
  uniqName: 'server',
  subprotocol: [1, 0],
  supports: [1]
})

setTimeout(function () {
  var error = new Error('Test Error')
  error.stack = error.stack.split('\n')[0] + '\nfake stacktrace'
  throw error
}, 10)
