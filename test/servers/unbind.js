#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x'
})
app.nodeId = 'server:r1CJmycQW'

app.destroy()

setTimeout(() => { }, 10000)
