#!/usr/bin/env node

var Server = require('../../server')

var app = new Server({
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

app.auth(() => {
  return Promise.resolve(true)
})

app.unbind.push(() => {
  return new Promise(resolve => {
    setTimeout(() => {
      process.stderr.write(' Custom destroy task finished\n')
      resolve()
    }, 10)
  })
})

app.listen({ port: 2000 })

process.on('message', msg => {
  if (msg === 'close') {
    console.error('close')
    app.destroy()
  }
})
