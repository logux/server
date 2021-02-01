#!/usr/bin/env node

import { delay } from 'nanodelay'

import { Server } from '../../index.js'

let app = new Server({
  controlSecret: 'secret',
  subprotocol: '1.0.0',
  supports: '1.0.0',
  backend: 'http://localhost:31339'
})

app.auth(async ({ user, token }) => {
  await delay(400)
  return user === '1' && token === 'secret'
})

app.on('error', () => {
  process.exit(1)
})

app.listen()
