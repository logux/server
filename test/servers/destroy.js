#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server({
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

app.auth(() => Promise.resolve(true))

app.unbind.push(() => new Promise(resolve => {
  setTimeout(() => {
    process.stderr.write(' Custom destroy task finished\n')
    resolve()
  }, 10)
}))

app.listen({ port: 2000 })

process.on('message', msg => {
  if (msg === 'close') {
    console.error('close')
    app.destroy()
  }
})
