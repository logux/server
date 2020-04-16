#!/usr/bin/env node

let { Server } = require('../..')

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  root: __dirname
})
app.nodeId = 'server:FnXaqDxY'

app.autoloadModules('modules/**/*.js')
app.auth(async () => true)

app.listen()
