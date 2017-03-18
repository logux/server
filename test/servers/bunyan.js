#!/usr/bin/env node

'use strict'

const bunyan = require('bunyan')
const Server = require('../../server')

const logger = bunyan.createLogger({ name: 'logux-server-test' })

const app = new Server({
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x',
  reporter: 'bunyan',
  bunyanLogger: logger
})

app.auth(() => Promise.resolve(true))

app.listen({ port: 1337 })
