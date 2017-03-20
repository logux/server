#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server({
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 2001
})

app.auth(() => Promise.resolve(true))

app.listen()
