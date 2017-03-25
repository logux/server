#!/usr/bin/env node

'use strict'

const Server = require('../../server')

const app = new Server({
  nodeId: 'server',
  subprotocol: '1.0.0',
  supports: '1.x'
})

const errorPromise = new Promise(resolve => {
  app.on('error', e => {
    // Waiting for server destruction message
    setTimeout(() => {
      console.log(`Error event: ${ e.message }`)
      resolve()
    }, 50)
  })
})

app.unbind.push(() => new Promise(resolve => {
  errorPromise.then(resolve)
}))

new Promise((resolve, reject) => {
  setTimeout(() => {
    const error = new Error('Test Error')
    error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`
    reject(error)
  }, 50)
})
