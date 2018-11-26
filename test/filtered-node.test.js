let ClientNode = require('logux-core').ClientNode
let TestPair = require('logux-core').TestPair
let TestTime = require('logux-core').TestTime

let FilteredNode = require('../filtered-node')

function createTest () {
  let time = new TestTime()
  let log1 = time.nextLog()
  let log2 = time.nextLog()

  log1.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })
  log2.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  let data = { nodeId: '1:a:b', userId: '1', clientId: '1:a' }
  let pair = new TestPair()
  let client = new ClientNode('1:a:b', log1, pair.left)
  let server = new FilteredNode(data, 'server', log2, pair.right)
  return { client, server }
}

let test
afterEach(() => {
  test.client.destroy()
  test.server.destroy()
})

it('does not sync actions on add', () => {
  test = createTest()
  return test.client.connection.connect().then(() => {
    return test.client.waitFor('synchronized')
  }).then(() => {
    return test.server.log.add({ type: 'A' })
  }).then(() => {
    return test.server.waitFor('synchronized')
  }).then(() => {
    expect(test.client.log.actions()).toEqual([])
  })
})

it('synchronizes only node-specific actions on connection', () => {
  test = createTest()
  return Promise.all([
    test.server.log.add({ type: 'A' }, { nodes: ['1:A:B'] }),
    test.server.log.add({ type: 'B' }, { nodes: ['1:a:b'] }),
    test.server.log.add({ type: 'C' })
  ]).then(() => {
    return test.client.connection.connect()
  }).then(() => {
    return test.server.waitFor('synchronized')
  }).then(() => {
    expect(test.client.log.actions()).toEqual([{ type: 'B' }])
  })
})

it('synchronizes only client-specific actions on connection', () => {
  test = createTest()
  return Promise.all([
    test.server.log.add({ type: 'A' }, { clients: ['1:A'] }),
    test.server.log.add({ type: 'B' }, { clients: ['1:a'] }),
    test.server.log.add({ type: 'C' })
  ]).then(() => {
    return test.client.connection.connect()
  }).then(() => {
    return test.server.waitFor('synchronized')
  }).then(() => {
    expect(test.client.log.actions()).toEqual([{ type: 'B' }])
  })
})

it('synchronizes only user-specific actions on connection', () => {
  test = createTest()
  return Promise.all([
    test.server.log.add({ type: 'A' }, { users: ['2'] }),
    test.server.log.add({ type: 'B' }, { users: ['1'] }),
    test.server.log.add({ type: 'C' })
  ]).then(() => {
    return test.client.connection.connect()
  }).then(() => {
    return test.server.waitFor('synchronized')
  }).then(() => {
    expect(test.client.log.actions()).toEqual([{ type: 'B' }])
  })
})

it('still sends only new actions', () => {
  test = createTest()
  return test.server.log.add({ type: 'A' }, { nodes: ['1:a:b'] }).then(() => {
    return test.server.log.add({ type: 'B' }, { nodes: ['1:a:b'] })
  }).then(() => {
    test.client.lastReceived = 1
    return test.client.connection.connect()
  }).then(() => {
    return test.server.waitFor('synchronized')
  }).then(() => {
    expect(test.client.log.actions()).toEqual([{ type: 'B' }])
  })
})
