#!/usr/bin/env node

const { ClientNode, WsConnection, Log, MemoryStore } = require('logux-core')
const ALLOWED_META = require('../../allowed-meta')
const WebSocket = require('ws')
const delay = require('nanodelay')

let index = 0
let stop = false

function map (action, meta) {
  const filtered = { }
  for (const i in meta) {
    if (ALLOWED_META.indexOf(i) !== -1) {
      filtered[i] = meta[i]
    }
  }
  return Promise.resolve([action, filtered])
}

function randomDelay (ms) {
  const random = ms / 3
  return delay(ms + (Math.random() * random))
}

function tick () {
  if (stop) return

  const nodeId = `1:${ ++index }`
  const connection = new WsConnection('ws://localhost:1337', WebSocket)
  const log = new Log({ nodeId, store: new MemoryStore() })
  const node = new ClientNode(nodeId, log, connection, {
    credentials: 'secret',
    subprotocol: '1.0.0',
    outMap: map
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
  node.waitFor('synchronized').then(() => {
    node.log.add({ type: 'logux/subscribe', channel: 'projects/1' })
    node.log.add({ type: 'logux/subscribe', channel: 'projects/2' })
    node.log.add({ type: 'logux/subscribe', channel: 'projects/3' })
    return randomDelay(5000)
  }).then(() => {
    node.log.add({ type: 'project/name', value: 'B' })
    return randomDelay(1000)
  }).then(() => {
    node.log.add({ type: 'project/name', value: 'B' })
    return randomDelay(1000)
  }).then(() => {
    node.log.add({ type: 'project/name', value: 'B' })
    return randomDelay(5000)
  }).then(() => {
    process.stdout.write('#')
    node.destroy()
    tick()
  })
}

for (let i = 0; i < 500; i++) {
  delay(Math.random() * 10000).then(() => {
    tick()
  })
}
