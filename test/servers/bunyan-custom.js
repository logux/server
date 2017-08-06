#!/usr/bin/env node

'use strict'

const bunyan = require('bunyan')
const Server = require('../../server')

const logger = bunyan.createLogger({
  name: 'logux-server-custom',
  customProp: '42'
})

const app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  bunyan: logger,
  port: 2000
})
app.nodeId = 'server:FnXaqDxY'

app.auth(() => Promise.resolve(true))

app.listen()
