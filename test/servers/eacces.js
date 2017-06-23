#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 1000
})
app.nodeId = 'server:r1CJmycQW'

app.auth(() => Promise.resolve(true))

app.listen()
