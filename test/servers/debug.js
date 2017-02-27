#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server({
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

app.debugError = e => {
  console.error(`debugError: ${ e.stack }`)
}

setTimeout(() => {
  const error = new Error('Test Error')
  error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`
  throw error
}, 10)
