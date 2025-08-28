#!/usr/bin/env node

import pino from 'pino'

import { Server } from '../../index.js'

let logger = pino({
  mixin() {
    return { customProp: '42' }
  },
  name: 'logux-server-custom',
  timestamp: pino.stdTimeFunctions.isoTime
})

let app = new Server({
  logger,
  minSubprotocol: 1,
  port: 2000,
  subprotocol: 1
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
