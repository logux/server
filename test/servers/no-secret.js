#!/usr/bin/env node

import { Server } from '../../index.js'

let app = new Server(
  Server.loadOptions(process, {
    subprotocol: '1.0.0',
    supports: '1.x',
    backend: 'http://localhost:5000/logux',
    host: '127.0.0.1'
  })
)

app.auth(async () => true)

app.listen()
