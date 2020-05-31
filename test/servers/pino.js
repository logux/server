#!/usr/bin/env node

let { Server } = require('../..')

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 2000,
  logger: 'json'
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
