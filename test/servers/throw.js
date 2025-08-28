#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server({
  minSubprotocol: 1,
  subprotocol: 1
})
app.nodeId = 'server:FnXaqDxY'

app.on('fatal', e => app.logger.info(`Fatal event: ${e.message}`))

setTimeout(() => {
  let error = new Error('Test Error')
  error.stack = `${error.stack.split('\n')[0]}\nfake stacktrace`
  throw error
}, 10)
