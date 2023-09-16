#!/usr/bin/env node

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Server } from '../../index.js'

let app = new Server(
  Server.loadOptions(process, {
    host: '127.0.0.1',
    root: join(fileURLToPath(import.meta.url), '..', '..', 'fixtures'),
    subprotocol: '1.0.0',
    supports: '1.x'
  })
)
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
