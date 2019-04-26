#!/usr/bin/env node

let { ClientNode, WsConnection, Log, MemoryStore } = require('@logux/core')
let WebSocket = require('ws')
let delay = require('nanodelay')

let ALLOWED_META = require('../../allowed-meta')

let index = 0
let stop = false

function map (action, meta) {
  let filtered = { }
  for (let i in meta) {
    if (ALLOWED_META.indexOf(i) !== -1) {
      filtered[i] = meta[i]
    }
  }
  return Promise.resolve([action, filtered])
}

function randomDelay (ms) {
  let random = ms / 3
  return delay(ms + (Math.random() * random))
}

async function tick () {
  if (stop) return

  let nodeId = `1:${ ++index }`
  let connection = new WsConnection('ws://localhost:31337', WebSocket)
  let log = new Log({ nodeId, store: new MemoryStore() })
  let node = new ClientNode(nodeId, log, connection, {
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
  await node.waitFor('synchronized')
  node.log.add({ type: 'logux/subscribe', channel: 'projects/1' })
  node.log.add({ type: 'logux/subscribe', channel: 'projects/2' })
  node.log.add({ type: 'logux/subscribe', channel: 'projects/3' })
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
  delay(Math.random() * 10000).then(() => {
    tick()
  })
}
