#!/usr/bin/env node

let pino = require('pino')

let { Server } = require('../..')

let logger = pino({
  name: 'logux-server-custom',
  mixin () {
    return { customProp: '42' }
  },
  timestamp: pino.stdTimeFunctions.isoTime
})

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  logger,
  port: 2000
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
