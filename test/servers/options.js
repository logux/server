#!/usr/bin/env node

const Server = require('../../server')

const app = new Server({
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

app.auth(() => {
  return Promise.resolve(true)
})

app.listen(app.loadOptions(process, {
  port: '1338',
  host: '127.0.0.1'
}))
