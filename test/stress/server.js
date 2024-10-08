#!/usr/bin/env node

import { setTimeout } from 'node:timers/promises'

import { Server } from '../../index.js'

let app = new Server({
  backend: 'http://localhost:31339',
  controlSecret: 'secret',
  subprotocol: '1.0.0',
  supports: '1.0.0'
})

app.auth(async ({ token, user }) => {
  await setTimeout(400)
  return user === '1' && token === 'secret'
})

app.on('error', () => {
  process.exit(1)
})

app.listen()
