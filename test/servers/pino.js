#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server({
  logger: 'json',
  minSubprotocol: 1,
  port: 2000,
  subprotocol: 1
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
