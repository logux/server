#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server({
  minSubprotocol: 1,
  root: import.meta.dirname,
  subprotocol: 1
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen().then(() => {
  app.autoloadModules('error-modules/*/index.js')
})
