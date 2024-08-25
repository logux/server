#!/usr/bin/env node

import { setTimeout } from 'node:timers/promises'

import { Server } from '../../index.js'

let app = new Server({
  port: 2000,
  subprotocol: '1.0.0',
  supports: '1.x'
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.unbind.push(async () => {
  await setTimeout(10)
  app.logger.info('Custom destroy task finished')
})

app.listen()

process.on('message', msg => {
  if (msg === 'close') {
    console.error('close')
    app.destroy()
  }
})
