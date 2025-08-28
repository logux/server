#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server({
  minSubprotocol: 1,
  subprotocol: 1
})
app.nodeId = 'server:FnXaqDxY'

app.destroy()

setTimeout(() => {}, 10000)
