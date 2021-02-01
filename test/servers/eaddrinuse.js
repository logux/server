#!/usr/bin/env node

import os from 'os'

import { Server } from '../../index.js'

os.platform = () => 'linux'

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 2001
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
