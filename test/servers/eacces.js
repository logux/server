#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 1000
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
