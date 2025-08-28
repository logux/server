#!/usr/bin/env node

import { join } from 'node:path'

import { Server } from '../../index.js'

let app = new Server(
  Server.loadOptions(process, {
    host: '127.0.0.1',
    minSubprotocol: 1,
    root: join(import.meta.dirname, '..', 'fixtures'),
    subprotocol: 1
  })
)
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
