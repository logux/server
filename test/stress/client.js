#!/usr/bin/env node

import { ClientNode, Log, MemoryStore, WsConnection } from '@logux/core'
import { setTimeout } from 'node:timers/promises'
import WebSocket from 'ws'

import { ALLOWED_META } from '../../index.js'

let index = 0
let stop = false

function onSend(action, meta) {
  let filtered = {}
  for (let i in meta) {
    if (ALLOWED_META.includes(i)) filtered[i] = meta[i]
  }
  return Promise.resolve([action, filtered])
}

function randomDelay(ms) {
  let random = ms / 3
  return setTimeout(ms + Math.random() * random)
}

async function tick() {
  if (stop) return

  let nodeId = `1:${++index}`
  let connection = new WsConnection('ws://localhost:31337', WebSocket)
  let log = new Log({ nodeId, store: new MemoryStore() })
  let node = new ClientNode(nodeId, log, connection, {
    onSend,
    subprotocol: '1.0.0',
    token: 'secret'
  })

  node.on('clientError', e => {
    stop = true
    throw e
  })
  node.catch(e => {
    stop = true
    throw e
  })

  node.connection.connect()
  await node.waitFor('synchronized')
  node.log.add({ channel: 'projects/1', type: 'logux/subscribe' })
  node.log.add({ channel: 'projects/2', type: 'logux/subscribe' })
  node.log.add({ channel: 'projects/3', type: 'logux/subscribe' })
  await randomDelay(5000)

  node.log.add({ type: 'project/name', value: 'B' })
  await randomDelay(1000)

  node.log.add({ type: 'project/name', value: 'B' })
  await randomDelay(1000)

  node.log.add({ type: 'project/name', value: 'B' })
  await randomDelay(5000)

  process.stdout.write('#')
  node.destroy()
  tick()
}

for (let i = 0; i < 100; i++) {
  setTimeout(Math.random() * 10000).then(() => {
    tick()
  })
}
