#!/usr/bin/env node

let Server = require('../../server')

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 2000,
  reporter: (name, details) => {
    console.log('Event:', name)
    console.log('Details:', JSON.stringify(details))
  }
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.listen()
