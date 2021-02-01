#!/usr/bin/env node

import { fileURLToPath } from 'url'
import { dirname } from 'path'

import { Server } from '../../index.js'

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  root: dirname(fileURLToPath(import.meta.url))
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.autoloadModules().then(() => {
  app.listen()
})
