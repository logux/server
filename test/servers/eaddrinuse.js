#!/usr/bin/env node

const Server = require('../../server')

const app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 2001
})
app.nodeId = 'server:FnXaqDxY'

app.auth(() => Promise.resolve(true))

app.listen()
