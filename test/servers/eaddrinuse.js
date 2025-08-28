#!/usr/bin/env node

import os from 'node:os'

import { Server } from '../../index.js'

os.platform = () => 'linux'

let app = new Server({
  minSubprotocol: 1,
  port: 2001,
  subprotocol: 1
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
