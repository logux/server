#!/usr/bin/env node

var Server = require('../../server')

var app = new Server({
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

app.debugError = error => {
  process.stderr.write(
    `debugError was called with error '${ error }' ` +
    `and stacktrace '${ error.stack }'\n`
  )
}

setTimeout(() => {
  var error = new Error('Test Error')
  error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`
  throw error
}, 10)
