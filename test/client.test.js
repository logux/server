'use strict'

const TestPair = require('logux-sync').TestPair

const BaseServer = require('../base-server')
const Client = require('../client')

function createConnection () {
  const pair = new TestPair()
  pair.left.ws = {
    upgradeReq: {
      headers: { },
      connection: {
        remoteAddress: '127.0.0.1'
      }
    }
  }
  return pair.left
}

function createServer (opts, reporter) {
  if (!opts) opts = { }
  opts.subprotocol = '0.0.0'
  opts.supports = '0.x'
  const server = new BaseServer(opts, reporter)
  server.auth(() => true)
  return server
}

function createReporter () {
  const reports = []
  const names = []
  const app = createServer({ }, function () {
    names.push(arguments[0])
    reports.push(Array.prototype.slice.call(arguments, 0))
  })
  return { app, reports, names }
}

let lastClient = 0
function createClient (app) {
  lastClient += 1
  const client = new Client(app, createConnection(), lastClient)
  app.clients[lastClient] = client
  return client
}

it('uses server options', () => {
  const app = createServer({
    nodeId: 'server',
    subprotocol: '0.0.0',
    supports: '0.x',
    timeout: 16000,
    ping: 8000
  })
  const client = new Client(app, createConnection(), 1)

  expect(client.sync.options.subprotocol).toEqual('0.0.0')
  expect(client.sync.options.timeout).toEqual(16000)
  expect(client.sync.options.ping).toEqual(8000)
  expect(client.sync.localNodeId).toEqual('server')
})

it('saves connection', () => {
  const connection = createConnection()
  const client = new Client(createServer(), connection, 1)
  expect(client.connection).toBe(connection)
})

it('use string key', () => {
  const client = new Client(createServer(), createConnection(), 1)
  expect(client.key).toEqual('1')
  expect(typeof client.key).toEqual('string')
})

it('has remote address shortcut', () => {
  const client = new Client(createServer(), createConnection(), 1)
  expect(client.remoteAddress).toEqual('127.0.0.1')
})

it('reports about connection', () => {
  const test = createReporter()
  const client = new Client(test.app, createConnection(), 1)
  expect(test.reports).toEqual([['connect', test.app, client]])
})

it('removes itself on destroy', () => {
  const test = createReporter()

  const client = createClient(test.app)

  return client.connection.connect()
    .then(() => client.auth({ }, '10:random'))
    .then(() => {
      client.destroy()
      expect(test.app.clients).toEqual({ })
      expect(test.app.nodeIds).toEqual({ })
      expect(client.connection.connected).toBeFalsy()
      expect(test.names).toEqual(['connect', 'authenticated', 'disconnect'])
      expect(test.reports[2]).toEqual(['disconnect', test.app, client])
    })
})

it('does not report users disconnects on server destroy', () => {
  const test = createReporter()

  const client = createClient(test.app)

  return client.connection.connect().then(() => {
    test.app.destroy()
    expect(test.app.clients).toEqual({ })
    expect(client.connection.connected).toBeFalsy()
    expect(test.names).toEqual(['connect', 'destroy'])
    expect(test.reports[1]).toEqual(['destroy', test.app])
  })
})

it('destroys on disconnect', () => {
  const client = createClient(createServer())
  client.destroy = jest.fn()
  return client.connection.connect().then(() => {
    client.connection.other().disconnect()
    return client.connection.pair.wait()
  }).then(() => {
    expect(client.destroy).toBeCalled()
  })
})

it('reports on wrong authentication', () => {
  const test = createReporter()
  test.app.auth(() => Promise.resolve(false))
  const client = new Client(test.app, createConnection(), 1)
  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, 'client', 0])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(test.names).toEqual(['connect', 'unauthenticated', 'disconnect'])
    expect(test.reports[1][1]).toEqual(test.app)
    expect(test.reports[1][2]).toEqual(client)
  })
})

it('authenticates user', () => {
  const test = createReporter()
  test.app.auth((id, token, who) => Promise.resolve(
    token === 'token' && id === '10' && who === client
  ))
  const client = createClient(test.app)

  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send([
      'connect', protocol, '10:random', 0, { credentials: 'token' }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(client.user).toEqual('10')
    expect(client.nodeId).toEqual('10:random')
    expect(client.sync.authenticated).toBeTruthy()
    expect(test.app.nodeIds).toEqual({ '10:random': client })
    expect(test.names).toEqual(['connect', 'authenticated'])
    expect(test.reports[1]).toEqual(['authenticated', test.app, client])
  })
})

it('supports non-promise authenticator', () => {
  const test = createReporter()
  test.app.auth((id, token) => token === 'token')
  const client = createClient(test.app)

  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send([
      'connect', protocol, '10:random', 0, { credentials: 'token' }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(client.sync.authenticated).toBeTruthy()
  })
})

it('reports about synchronization errors', () => {
  const test = createReporter()
  const client = createClient(test.app)
  return client.connection.connect().then(() => {
    client.connection.other().send(['error', 'wrong-format'])
    return client.connection.pair.wait()
  }).then(() => {
    expect(test.names).toEqual(['connect', 'syncError'])
    expect(test.reports[1][0]).toEqual('syncError')
    expect(test.reports[1][1]).toEqual(test.app)
    expect(test.reports[1][2]).toEqual(client)
    expect(test.reports[1][3].type).toEqual('wrong-format')
  })
})

it('checks subprotocol', () => {
  const test = createReporter()
  const client = createClient(test.app)
  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send([
      'connect', protocol, 'client', 0, { subprotocol: '1.0.0' }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(test.names).toEqual(['connect', 'clientError', 'disconnect'])
    expect(test.reports[1][3].message).toEqual(
      'Only 0.x application subprotocols are supported, but you use 1.0.0')
    expect(test.reports[2][0]).toEqual('disconnect')
  })
})

it('has method to check client subprotocol', () => {
  const test = createReporter()
  const client = createClient(test.app)
  client.sync.remoteSubprotocol = '1.0.1'
  expect(client.isSubprotocol('>= 1.0.0')).toBeTruthy()
  expect(client.isSubprotocol('< 1.0.0')).toBeFalsy()
})

it('sends server credentials in development', () => {
  const app = createServer({ env: 'development' })

  const client = createClient(app)
  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, 'client', 0])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(client.connection.pair.leftSent[0][4]).toEqual({
      credentials: { env: 'development' },
      subprotocol: '0.0.0'
    })
  })
})

it('does not send server credentials in production', () => {
  const app = createServer({ env: 'production' })
  app.auth(() => Promise.resolve(true))

  const client = createClient(app)
  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, 'client', 0])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(client.connection.pair.leftSent[0][4]).toEqual({
      subprotocol: '0.0.0'
    })
  })
})

it('disconnects zombie', () => {
  const test = createReporter()

  const client1 = createClient(test.app)
  const client2 = createClient(test.app)

  return client1.connection.connect().then(() => {
    client1.auth({ }, '10:random')
    client2.connection.connect()
  }).then(() => {
    client2.auth({ }, '10:random')
  }).then(() => {
    expect(Object.keys(test.app.clients)).toEqual([client2.key])
    expect(test.names).toEqual([
      'connect',
      'connect',
      'authenticated',
      'zombie',
      'authenticated'
    ])
    expect(test.reports[3]).toEqual(['zombie', test.app, client1])
  })
})

it('checks action creator', () => {
  const test = createReporter()
  test.app.log.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  const client = createClient(test.app)
  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, '10:uuid', 0])
    return client.connection.pair.wait('right')
  }).then(() => {
    client.connection.other().send(['sync', 2,
      { type: 'FOO' }, { id: [1, '10:uuid', 0] },
      { type: 'FOO' }, { id: [2, '1:uuid', 0] }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(test.names).toEqual(['connect', 'authenticated', 'denied', 'add'])
    expect(test.reports[2][3].id).toEqual([2, '1:uuid', 0])
    expect(test.reports[3][3].id).toEqual([1, '10:uuid', 0])
  })
})

it('checks action meta', () => {
  const test = createReporter()
  test.app.log.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  const client = createClient(test.app)
  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, '10:uuid', 0])
    return client.connection.pair.wait('right')
  }).then(() => {
    client.connection.other().send(['sync', 2,
      { type: 'FOO' }, { id: [1, '10:uuid', 0], status: 'processed' },
      { type: 'FOO' }, { id: [2, '10:uuid', 0], time: 3 }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(test.names).toEqual(['connect', 'authenticated', 'denied', 'add'])
    expect(test.reports[2][3].id).toEqual([1, '10:uuid', 0])
    expect(test.reports[3][3].id).toEqual([2, '10:uuid', 0])
  })
})
