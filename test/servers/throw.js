#!/usr/bin/env node

let Server = require('../../server')

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x'
})
app.nodeId = 'server:FnXaqDxY'

app.on('fatal', e => console.log(`Fatal event: ${ e.message }`))

setTimeout(() => {
  let error = new Error('Test Error')
  error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`
  throw error
}, 10)
