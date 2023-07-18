import { ClientNode, type TestLog, TestPair, TestTime } from '@logux/core'
import { afterEach, expect, it } from 'vitest'

import { FilteredNode } from '../filtered-node/index.js'

type Test = {
  client: ClientNode<{}, TestLog>
  server: FilteredNode
}

function createTest(): Test {
  let time = new TestTime()
  let log1 = time.nextLog()
  let log2 = time.nextLog()

  log1.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })
  log2.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  let data = { clientId: '1:a', nodeId: '1:a:b', userId: '1' }
  let pair = new TestPair()
  let client = new ClientNode('1:a:b', log1, pair.left)
  let server = new FilteredNode(data, 'server', log2, pair.right)
  return { client, server }
}

let test: Test
afterEach(async () => {
  test.client.destroy()
  test.server.destroy()
})

it('does not sync actions on add', async () => {
  test = createTest()
  await test.client.connection.connect()
  await test.client.waitFor('synchronized')
  await test.server.log.add({ type: 'A' })
  await test.server.waitFor('synchronized')
  expect(test.client.log.actions()).toEqual([])
})

it('synchronizes only node-specific actions on connection', async () => {
  test = createTest()
  await test.server.log.add({ type: 'A' }, { nodes: ['1:A:B'] })
  await test.server.log.add({ type: 'B' }, { nodes: ['1:a:b'] })
  await test.server.log.add({ type: 'C' })
  await test.client.connection.connect()

  await test.server.waitFor('synchronized')

  expect(test.client.log.actions()).toEqual([{ type: 'B' }])
})

it('synchronizes only client-specific actions on connection', async () => {
  test = createTest()
  await test.server.log.add({ type: 'A' }, { clients: ['1:A'] })
  await test.server.log.add({ type: 'B' }, { clients: ['1:a'] })
  await test.server.log.add({ type: 'C' })
  await test.client.connection.connect()

  await test.server.waitFor('synchronized')

  expect(test.client.log.actions()).toEqual([{ type: 'B' }])
})

it('synchronizes only user-specific actions on connection', async () => {
  test = createTest()
  await test.server.log.add({ type: 'A' }, { users: ['2'] })
  await test.server.log.add({ type: 'B' }, { users: ['1'] })
  await test.server.log.add({ type: 'C' })
  await test.client.connection.connect()

  await test.server.waitFor('synchronized')

  expect(test.client.log.actions()).toEqual([{ type: 'B' }])
})

it('still sends only new actions', async () => {
  test = createTest()
  await test.server.log.add({ type: 'A' }, { nodes: ['1:a:b'] })
  await test.server.log.add({ type: 'B' }, { nodes: ['1:a:b'] })

  test.client.lastReceived = 1
  await test.client.connection.connect()

  await test.server.waitFor('synchronized')

  expect(test.client.log.actions()).toEqual([{ type: 'B' }])
})
