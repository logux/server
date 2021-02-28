#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server(
  Server.loadOptions(process, {
    subprotocol: '1.0.0',
    supports: '1.x',
    host: '127.0.0.1'
  })
)
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.logger.info({ field: 1 }, 'Hi from custom logger')

app.listen()
