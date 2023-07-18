#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server({
  port: 1000,
  subprotocol: '1.0.0',
  supports: '1.x'
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
