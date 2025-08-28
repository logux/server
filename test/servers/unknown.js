#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server(
  Server.loadOptions(process, {
    host: '127.0.0.1',
    maxSubprotocol: 1,
    subprotocol: 1
  })
)
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
