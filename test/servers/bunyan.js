#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 2000,
  reporter: 'bunyan'
})
app.nodeId = 'server:FnXaqDxY5e'

app.auth(() => Promise.resolve(true))

app.listen()
