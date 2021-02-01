#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server(
  Server.loadOptions(process, {
    subprotocol: '1.0.0',
    support: '1.x',
    host: '127.0.0.1'
  })
)
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
