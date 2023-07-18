#!/usr/bin/env node

import os from 'os'

import { Server } from '../../index.js'

os.platform = () => 'linux'

let app = new Server({
  port: 2001,
  subprotocol: '1.0.0',
  supports: '1.x'
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
