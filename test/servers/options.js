#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server(
  Server.loadOptions(process, {
    nodeId: 'server',
    subprotocol: '1.0.0',
    supports: '1.x',
    host: '127.0.0.1'
  })
)

app.auth(() => Promise.resolve(true))

app.listen()
