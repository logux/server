#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server({
  minSubprotocol: 1,
  port: 1000,
  subprotocol: 1
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
