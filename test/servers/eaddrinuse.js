#!/usr/bin/env node

let Server = require('../../server')

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 2001
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
