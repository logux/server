#!/usr/bin/env node

const Server = require('../../server')

const app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x'
})
app.nodeId = 'server:FnXaqDxY'

app.destroy()

setTimeout(() => { }, 10000)
