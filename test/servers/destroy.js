#!/usr/bin/env node

let { delay } = require('nanodelay')

let Server = require('../../server')

let app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  port: 2000
})
app.nodeId = 'server:FnXaqDxY'

app.auth(async () => true)

app.unbind.push(async () => {
  await delay(10)
  process.stderr.write(' Custom destroy task finished\n')
})

app.listen()

process.on('message', msg => {
  if (msg === 'close') {
    console.error('close')
    app.destroy()
  }
})
