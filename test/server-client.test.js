'use strict'

const TestPair = require('logux-sync').TestPair

const ServerClient = require('../server-client')
const BaseServer = require('../base-server')

function createConnection () {
  const pair = new TestPair()
  pair.left.ws = {
    _socket: {
      remoteAddress: '127.0.0.1'
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
  server.log.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

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

function createClient (app) {
  app.lastClient += 1
  const client = new ServerClient(app, createConnection(), app.lastClient)
  app.clients[app.lastClient] = client
  return client
}

function connectClient (server, nodeId) {
  if (!nodeId) nodeId = '10:uuid'
  const client = createClient(server)
  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, nodeId, 0])
    return client.connection.pair.wait('right')
  }).then(() => {
    return client
  })
}

function actions (app) {
  return app.log.store.created.map(i => i[0])
}

function sent (client) {
  return client.sync.connection.pair.leftSent
}

function sentNames (client) {
  return sent(client).map(i => i[0])
}

it('uses server options', () => {
  const app = createServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    timeout: 16000,
    ping: 8000
  })
  app.nodeId = 'server:uuid'
  const client = new ServerClient(app, createConnection(), 1)

  expect(client.sync.options.subprotocol).toEqual('0.0.0')
  expect(client.sync.options.timeout).toEqual(16000)
  expect(client.sync.options.ping).toEqual(8000)
  expect(client.sync.localNodeId).toEqual('server:uuid')
})

it('saves connection', () => {
  const connection = createConnection()
  const client = new ServerClient(createServer(), connection, 1)
  expect(client.connection).toBe(connection)
})

it('use string key', () => {
  const client = new ServerClient(createServer(), createConnection(), 1)
  expect(client.key).toEqual('1')
  expect(typeof client.key).toEqual('string')
})

it('has remote address shortcut', () => {
  const client = new ServerClient(createServer(), createConnection(), 1)
  expect(client.remoteAddress).toEqual('127.0.0.1')
})

it('reports about connection', () => {
  const test = createReporter()
  const client = new ServerClient(test.app, createConnection(), 1)
  expect(test.reports).toEqual([['connect', test.app, client]])
})

it('removes itself on destroy', () => {
  const test = createReporter()

  const client1 = createClient(test.app)
  const client2 = createClient(test.app)

  return Promise.all([
    client1.connection.connect(),
    client2.connection.connect()
  ]).then(() => {
    client1.auth({ }, '10:uuid')
    client2.auth({ }, '10:other')
  }).then(() => {
    client1.destroy()
    expect(test.app.users).toEqual({ 10: [client2] })
    expect(client1.connection.connected).toBeFalsy()
    expect(test.names).toEqual([
      'connect', 'connect', 'authenticated', 'authenticated', 'disconnect'])
    expect(test.reports[4]).toEqual(['disconnect', test.app, client1])
    client2.destroy()
    expect(test.app.clients).toEqual({ })
    expect(test.app.nodeIds).toEqual({ })
    expect(test.app.users).toEqual({ })
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
  const client = new ServerClient(test.app, createConnection(), 1)
  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, '10:uuid', 0])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(test.names).toEqual(['connect', 'unauthenticated', 'disconnect'])
    expect(test.reports[1][1]).toEqual(test.app)
    expect(test.reports[1][2]).toEqual(client)
  })
})

it('reports on server in user name', () => {
  const test = createReporter()
  test.app.auth(() => Promise.resolve(true))
  const client = new ServerClient(test.app, createConnection(), 1)
  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, 'server:uuid', 0])
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
      'connect', protocol, '10:uuid', 0, { credentials: 'token' }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(client.user).toEqual('10')
    expect(client.nodeId).toEqual('10:uuid')
    expect(client.sync.authenticated).toBeTruthy()
    expect(test.app.nodeIds).toEqual({ '10:uuid': client })
    expect(test.app.users).toEqual({ 10: [client] })
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
      'connect', protocol, '10:uuid', 0, { credentials: 'token' }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(client.sync.authenticated).toBeTruthy()
  })
})

it('authenticates user without user name', () => {
  const test = createReporter()
  test.app.auth(() => true)
  const client = createClient(test.app)

  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, 'uuid', 0])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(client.user).not.toBeDefined()
    expect(test.app.users).toEqual({ })
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
      'connect', protocol, '10:uuid', 0, { subprotocol: '1.0.0' }
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
  return connectClient(app).then(client => {
    expect(sent(client)[0][4]).toEqual({
      credentials: { env: 'development' },
      subprotocol: '0.0.0'
    })
  })
})

it('does not send server credentials in production', () => {
  const app = createServer({ env: 'production' })
  app.auth(() => Promise.resolve(true))

  return connectClient(app).then(client => {
    expect(sent(client)[0][4]).toEqual({ subprotocol: '0.0.0' })
  })
})

it('disconnects zombie', () => {
  const test = createReporter()

  const client1 = createClient(test.app)
  const client2 = createClient(test.app)

  return client1.connection.connect().then(() => {
    client1.auth({ }, '10:uuid')
    client2.connection.connect()
  }).then(() => {
    client2.auth({ }, '10:uuid')
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
  test.app.type('GOOD', { access: () => true })
  test.app.type('BAD', { access: () => true })

  return connectClient(test.app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'GOOD' }, { id: [1, '10:uuid', 0] },
      { type: 'BAD' }, { id: [2, '1:uuid', 0] }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(actions(test.app)).toEqual([{ type: 'GOOD' }])
    expect(test.names).toEqual(['connect', 'authenticated', 'denied', 'add'])
    expect(test.reports[2][3].id).toEqual([2, '1:uuid', 0])
    expect(test.reports[3][3].id).toEqual([1, '10:uuid', 0])
  })
})

it('checks action meta', () => {
  const test = createReporter()
  test.app.type('GOOD', { access: () => true })
  test.app.type('BAD', { access: () => true })

  return connectClient(test.app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'BAD' }, { id: [1, '10:uuid', 0], status: 'processed' },
      { type: 'GOOD' }, { id: [2, '10:uuid', 0], time: 3 }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(actions(test.app)).toEqual([{ type: 'GOOD' }])
    expect(test.names).toEqual(['connect', 'authenticated', 'denied', 'add'])
    expect(test.reports[2][3].id).toEqual([1, '10:uuid', 0])
    expect(test.reports[3][3].id).toEqual([2, '10:uuid', 0])
  })
})

it('ignores unknown action types', () => {
  const test = createReporter()

  return connectClient(test.app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'UNKNOWN' }, { id: [1, '10:uuid', 0] }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(actions(test.app)).toEqual([
      { type: 'logux/undo', reason: 'unknowType', id: [1, '10:uuid', 0] }
    ])
    expect(test.names).toEqual([
      'connect', 'authenticated', 'unknowType', 'add'])
    expect(test.reports[2][1]).toBe(test.app)
    expect(test.reports[2][2].type).toEqual('UNKNOWN')
    expect(test.reports[2][3].id).toEqual([1, '10:uuid', 0])
  })
})

it('checks user access for action', () => {
  const test = createReporter()
  test.app.type('FOO', {
    access (action, meta, user) {
      expect(user).toEqual('10')
      expect(meta.id).toBeDefined()
      return Promise.resolve(!!action.bar)
    }
  })

  return connectClient(test.app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'FOO' }, { id: [1, '10:uuid', 0] },
      { type: 'FOO', bar: true }, { id: [1, '10:uuid', 1] }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(actions(test.app)).toEqual([
      { type: 'logux/undo', reason: 'denied', id: [1, '10:uuid', 0] },
      { type: 'FOO', bar: true }
    ])
    expect(test.names).toEqual([
      'connect', 'authenticated', 'denied', 'add', 'add'])
    expect(test.reports[2][1]).toBe(test.app)
    expect(test.reports[2][2].type).toEqual('FOO')
    expect(test.reports[2][3].id).toEqual([1, '10:uuid', 0])
  })
})

it('reports about errors in access callback', () => {
  const error = new Error('test')

  const test = createReporter()
  test.app.type('FOO', {
    access () {
      throw error
    }
  })

  let throwed
  test.app.on('error', e => {
    throwed = e
  })

  return connectClient(test.app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'FOO', bar: true }, { id: [1, '10:uuid', 0] }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(actions(test.app)).toEqual([
      { type: 'logux/undo', reason: 'error', id: [1, '10:uuid', 0] }
    ])
    expect(test.names).toEqual([
      'connect', 'authenticated', 'runtimeError', 'add'])
    expect(throwed).toEqual(error)
  })
})

it('sends old actions by node ID', () => {
  const app = createServer()
  app.type('FOO', { access: () => true })

  return Promise.all([
    app.log.add({ type: 'FOO' }, { id: [1, 'server:uuid', 0] }),
    app.log.add({ type: 'FOO' }, {
      id: [2, 'server:uuid', 0], nodeIds: ['10:uuid']
    })
  ]).then(() => {
    return connectClient(app)
  }).then(client => {
    client.connection.other().send(['synced', 2])
    return client.sync.waitFor('synchronized').then(() => {
      expect(sentNames(client)).toEqual(['connected', 'sync'])
      expect(sent(client)[1]).toEqual([
        'sync', 2, { type: 'FOO' }, { id: [2, 'server:uuid', 0], time: 2 }
      ])
    })
  })
})

it('sends new actions by node ID', () => {
  const app = createServer()
  app.type('FOO', { access: () => true })

  return connectClient(app).then(client => {
    return Promise.all([
      app.log.add({ type: 'FOO' }, { id: [1, 'server:uuid', 0] }),
      app.log.add({ type: 'FOO' }, {
        id: [2, 'server:uuid', 0], nodeIds: ['10:uuid']
      })
    ]).then(() => {
      client.connection.other().send(['synced', 2])
      return client.sync.waitFor('synchronized')
    }).then(() => {
      expect(sentNames(client)).toEqual(['connected', 'sync'])
      expect(sent(client)[1]).toEqual([
        'sync', 2, { type: 'FOO' }, { id: [2, 'server:uuid', 0], time: 2 }
      ])
    })
  })
})

it('sends old actions by user', () => {
  const app = createServer()
  app.type('FOO', { access: () => true })

  return Promise.all([
    app.log.add({ type: 'FOO' }, { id: [1, 'server:uuid', 0] }),
    app.log.add({ type: 'FOO' }, { id: [2, 'server:uuid', 0], users: ['10'] })
  ]).then(() => {
    return connectClient(app)
  }).then(client => {
    client.connection.other().send(['synced', 2])
    return client.sync.waitFor('synchronized').then(() => {
      expect(sentNames(client)).toEqual(['connected', 'sync'])
      expect(sent(client)[1]).toEqual([
        'sync', 2, { type: 'FOO' }, { id: [2, 'server:uuid', 0], time: 2 }
      ])
    })
  })
})

it('sends new actions by user', () => {
  const app = createServer()
  app.type('FOO', { access: () => true })

  return connectClient(app).then(client => {
    return Promise.all([
      app.log.add({ type: 'FOO' }, { id: [1, 'server:uuid', 0] }),
      app.log.add({ type: 'FOO' }, { id: [2, 'server:uuid', 0], users: ['10'] })
    ]).then(() => {
      client.connection.other().send(['synced', 2])
      return client.sync.waitFor('synchronized')
    }).then(() => {
      expect(sentNames(client)).toEqual(['connected', 'sync'])
      expect(sent(client)[1]).toEqual([
        'sync', 2, { type: 'FOO' }, { id: [2, 'server:uuid', 0], time: 2 }
      ])
    })
  })
})

it('sends old action only once', () => {
  const app = createServer()
  app.type('FOO', { access: () => true })

  return Promise.all([
    app.log.add({ type: 'FOO' }, {
      id: [1, 'server:uuid', 0],
      users: ['10', '10'],
      nodeIds: ['10:uuid', '10:uuid']
    })
  ]).then(() => {
    return connectClient(app)
  }).then(client => {
    client.connection.other().send(['synced', 2])
    return client.sync.waitFor('synchronized').then(() => {
      expect(sentNames(client)).toEqual(['connected', 'sync'])
      expect(sent(client)[1]).toEqual([
        'sync', 1, { type: 'FOO' }, { id: [1, 'server:uuid', 0], time: 1 }
      ])
    })
  })
})

it('does not resent unknown types before processing', () => {
  const app = createServer()

  return connectClient(app).then(client => {
    return Promise.all([
      app.log.add({ type: 'UNKNOWN' }, {
        id: [1, 'server:uuid', 0], nodeIds: ['10:uuid']
      }),
      app.log.add({ type: 'UNKNOWN' }, {
        id: [2, 'server:uuid', 0], nodeIds: ['10:uuid'], status: 'processed'
      })
    ]).then(() => {
      client.connection.other().send(['synced', 2])
      return client.sync.waitFor('synchronized')
    }).then(() => {
      expect(sentNames(client)).toEqual(['connected', 'sync'])
      expect(sent(client)[1]).toEqual([
        'sync', 2, { type: 'UNKNOWN' }, { id: [2, 'server:uuid', 0], time: 2 }
      ])
    })
  })
})

it('sends debug back on unknown type', () => {
  const app = createServer({ env: 'development' })
  return Promise.all([
    connectClient(app),
    connectClient(app, '20:uuid')
  ]).then(clients => {
    return Promise.all([
      app.log.add({ type: 'UNKNOWN' }, { id: [1, 'server:uuid', 0] }),
      app.log.add({ type: 'UNKNOWN' }, { id: [2, '10:uuid', 0] })
    ]).then(() => {
      return clients[0].sync.connection.pair.wait('right')
    }).then(() => {
      expect(sent(clients[0])[1]).toEqual([
        'debug', 'error', 'Action with unknown type UNKNOWN'
      ])
      expect(sentNames(clients[1])).toEqual(['connected'])
    })
  })
})

it('does not send debug back on unknown type in production', () => {
  const app = createServer({ env: 'production' })
  return connectClient(app).then(client => {
    return app.log.add({ type: 'U' }, { id: [1, '10:uuid', 0] }).then(() => {
      return client.sync.connection.pair.wait('right')
    }).then(() => {
      expect(sentNames(client)).toEqual(['connected', 'sync'])
    })
  })
})
