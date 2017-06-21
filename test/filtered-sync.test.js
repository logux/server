'use strict'

const ClientSync = require('logux-sync').ClientSync
const TestPair = require('logux-sync').TestPair
const TestTime = require('logux-core').TestTime

const FilteredSync = require('../filtered-sync')

function actions (sync) {
  return sync.log.store.created.map(i => i[0])
}

function createTest () {
  const time = new TestTime()
  const log1 = time.nextLog()
  const log2 = time.nextLog()

  log1.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })
  log2.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  const pair = new TestPair()
  const client = new ClientSync('1:a', log1, pair.left)
  const server = new FilteredSync({ nodeId: '1:a' }, 'server', log2, pair.right)
  return { client, server }
}

it('does not sync actions on add', () => {
  const test = createTest()
  return test.client.connection.connect().then(() => {
    return test.client.waitFor('synchronized')
  }).then(() => {
    return test.server.log.add({ type: 'A' })
  }).then(() => {
    return test.server.waitFor('synchronized')
  }).then(() => {
    expect(actions(test.client)).toEqual([])
  })
})

it('synchronizes only node-specific actions on connection', () => {
  const test = createTest()
  return Promise.all([
    test.server.log.add({ type: 'A' }, { nodes: ['1:b'] }),
    test.server.log.add({ type: 'B' }, { nodes: ['1:a'] }),
    test.server.log.add({ type: 'C' })
  ]).then(() => {
    return test.client.connection.connect()
  }).then(() => {
    return test.server.waitFor('synchronized')
  }).then(() => {
    expect(actions(test.client)).toEqual([{ type: 'B' }])
  })
})
