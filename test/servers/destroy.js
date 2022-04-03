#!/usr/bin/env node

import { delay } from 'nanodelay'

import { Server } from '../../index.js'

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 2000
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.unbind.push(async () => {
  await delay(10)
  app.logger.info('Custom destroy task finished')
})

app.listen()

process.on('message', msg => {
  if (msg === 'close') {
    console.error('close')
    app.destroy()
  }
})
