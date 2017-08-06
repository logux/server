#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x'
})
app.nodeId = 'server:FnXaqDxY5e'

app.on('error', e => console.log(`Error event: ${ e.message }`))

setTimeout(() => {
  const error = new Error('Test Error')
  error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`
  throw error
}, 10)
