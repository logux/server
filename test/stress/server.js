#!/usr/bin/env node

const memwatch = require('node-memwatch')
const delay = require('nanodelay')

const Server = require('../../server')

memwatch.on('leak', info => {
  throw new Error(info.reason)
})

const app = new Server({
  subprotocol: '1.0.0',
  supports: '1.0.0',
  backend: {
    url: 'http://localhost:1339',
    password: 'secret'
  }
})

app.auth((user, token) => {
  return delay(400).then(() => user === '1' && token === 'secret')
})

app.on('error', () => {
  process.exit(1)
})

app.listen()
