#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server({
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
  const error = new Error('Test Error')
  error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`
  throw error
}, 10)
