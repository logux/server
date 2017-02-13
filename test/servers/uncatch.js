#!/usr/bin/env node

var Server = require('../../server')

new Server({
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

new Promise((resolve, reject) => {
  setTimeout(() => {
    var error = new Error('Test Error')
    error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`
    reject(error)
  }, 10)
})
