#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server(
  Server.loadOptions(process, {
    subprotocol: '1.0.0',
    support: '1.x',
    host: '127.0.0.1'
  })
)
app.nodeId = 'server:r1CJmycQW'

app.auth(() => Promise.resolve(true))

app.listen()
