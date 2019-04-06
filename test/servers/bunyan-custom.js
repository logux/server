#!/usr/bin/env node

let bunyan = require('bunyan')

let Server = require('../../server')

let logger = bunyan.createLogger({
  name: 'logux-server-custom',
  customProp: '42'
})

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  bunyan: logger,
  port: 2000
})
app.nodeId = 'server:FnXaqDxY'

app.auth(() => Promise.resolve(true))

app.listen()
