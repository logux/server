const SyncError = require('logux-core').SyncError
const TestPair = require('logux-core').TestPair
const delay = require('nanodelay')

const ServerClient = require('../server-client')
const BaseServer = require('../base-server')

let destroyable = []

function createConnection () {
  const pair = new TestPair()
  pair.left.ws = {
    _socket: {
      remoteAddress: '127.0.0.1'
    }
  }
  return pair.left
}

function createServer (opts) {
  if (!opts) opts = { }
  opts.subprotocol = '0.0.1'
  opts.supports = '0.x'

  const server = new BaseServer(opts)
  server.auth(() => true)
  server.log.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  destroyable.push(server)

  return server
}

function createReporter (opts) {
  const names = []
  const reports = []

  opts = opts || { }
  opts.reporter = (name, details) => {
    names.push(name)
    reports.push([name, details])
  }

  const app = createServer(opts)
  return { app, reports, names }
}

function createClient (app) {
  app.lastClient += 1
  const client = new ServerClient(app, createConnection(), app.lastClient)
  app.clients[app.lastClient] = client
  destroyable.push(client)
  return client
}

function connectClient (server, nodeId) {
  if (!nodeId) nodeId = '10:uuid'
  const client = createClient(server)
  client.sync.now = () => 0
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

afterEach(() => {
  destroyable.forEach(i => i.destroy())
  destroyable = []
})

it('uses server options', () => {
  const app = createServer({
    subprotocol: '0.0.1',
    supports: '0.x',
    timeout: 16000,
    ping: 8000
  })
  app.nodeId = 'server:uuid'
  const client = new ServerClient(app, createConnection(), 1)

  expect(client.sync.options.subprotocol).toEqual('0.0.1')
  expect(client.sync.options.timeout).toEqual(16000)
  expect(client.sync.options.ping).toEqual(8000)
  expect(client.sync.localNodeId).toEqual('server:uuid')
})

it('saves connection', () => {
  const connection = createConnection()
  const client = new ServerClient(createServer(), connection, 1)
  expect(client.connection).toBe(connection)
})

it('uses string key', () => {
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
  new ServerClient(test.app, createConnection(), 1)
  expect(test.reports).toEqual([['connect', {
    clientId: '1', ipAddress: '127.0.0.1'
  }]])
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
    test.app.subscribers = {
      'user/10': {
        '10:uuid': client1,
        '10:other': client2
      }
    }
    return Promise.resolve()
  }).then(() => {
    client1.destroy()
    expect(test.app.users).toEqual({ 10: [client2] })
    expect(test.app.subscribers).toEqual({
      'user/10': { '10:other': client2 }
    })
    expect(client1.connection.connected).toBeFalsy()
    expect(test.names).toEqual([
      'connect', 'connect', 'authenticated', 'authenticated', 'disconnect'
    ])
    expect(test.reports[4]).toEqual(['disconnect', { nodeId: '10:uuid' }])

    client2.destroy()
    expect(test.app.clients).toEqual({ })
    expect(test.app.nodeIds).toEqual({ })
    expect(test.app.users).toEqual({ })
    expect(test.app.subscribers).toEqual({ })
  })
})

it('reports client ID before authentication', () => {
  const test = createReporter()
  const client = createClient(test.app)

  return client.connection.connect().then(() => {
    client.destroy()
    expect(test.reports[1]).toEqual(['disconnect', { clientId: '1' }])
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
    expect(test.reports[1]).toEqual(['destroy', undefined])
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
    expect(test.reports[1]).toEqual(['unauthenticated', {
      clientId: '1', nodeId: '10:uuid', subprotocol: '0.0.0'
    }])
  })
})

it('blocks authentication bruteforce', () => {
  const test = createReporter()
  test.app.auth(() => Promise.resolve(false))
  function connect (num) {
    const client = new ServerClient(test.app, createConnection(), num)
    return client.connection.connect().then(() => {
      const protocol = client.sync.localProtocol
      client.connection.other().send(['connect', protocol, num + ':uuid', 0])
      return client.connection.pair.wait('right')
    })
  }
  return Promise.all([1, 2, 3, 4, 5].map(i => {
    return connect(i)
  })).then(() => {
    expect(test.names.filter(i => i === 'disconnect')).toHaveLength(5)
    expect(test.names.filter(i => i === 'unauthenticated')).toHaveLength(3)
    expect(test.names.filter(i => i === 'error')).toHaveLength(2)
    test.reports.filter(i => i[0] === 'error').forEach(report => {
      expect(report[1].err.type).toEqual('bruteforce')
      expect(report[1].nodeId).toMatch(/(4|5):uuid/)
    })
    return delay(3050)
  }).then(() => {
    return connect(6)
  }).then(() => {
    expect(test.names.filter(i => i === 'disconnect')).toHaveLength(6)
    expect(test.names.filter(i => i === 'unauthenticated')).toHaveLength(4)
    expect(test.names.filter(i => i === 'error')).toHaveLength(2)
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
    expect(test.reports[1]).toEqual(['unauthenticated', {
      clientId: '1', nodeId: 'server:uuid', subprotocol: '0.0.0'
    }])
  })
})

it('authenticates user', () => {
  const test = createReporter()
  test.app.auth((id, token, who) => Promise.resolve(
    token === 'token' && id === 'a:b' && who === client
  ))
  const client = createClient(test.app)

  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send([
      'connect', protocol, 'a:b:uuid', 0, { credentials: 'token' }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(client.userId).toEqual('a:b')
    expect(client.nodeId).toEqual('a:b:uuid')
    expect(client.sync.authenticated).toBeTruthy()
    expect(test.app.nodeIds).toEqual({ 'a:b:uuid': client })
    expect(test.app.users).toEqual({ 'a:b': [client] })
    expect(test.names).toEqual(['connect', 'authenticated'])
    expect(test.reports[1]).toEqual(['authenticated', {
      clientId: '1', nodeId: 'a:b:uuid', subprotocol: '0.0.0'
    }])
  })
})

it('supports non-promise authenticator', () => {
  const app = createServer()
  app.auth((id, token) => token === 'token')
  const client = createClient(app)

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
  const app = createServer()
  const client = createClient(app)

  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, 'uuid', 0])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(client.userId).toBeUndefined()
    expect(app.users).toEqual({ })
  })
})

it('reports about synchronization errors', () => {
  const test = createReporter()
  const client = createClient(test.app)
  return client.connection.connect().then(() => {
    client.connection.other().send(['error', 'wrong-format'])
    return client.connection.pair.wait()
  }).then(() => {
    expect(test.names).toEqual(['connect', 'error'])
    expect(test.reports[1]).toEqual(['error', {
      clientId: '1',
      err: new SyncError(client.sync, 'wrong-format', undefined, true)
    }])
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
    expect(test.names).toEqual(['connect', 'error', 'disconnect'])
    expect(test.reports[1]).toEqual(['error', {
      clientId: '1',
      err: new SyncError(client.sync, 'wrong-subprotocol', {
        supported: '0.x', used: '1.0.0'
      })
    }])
  })
})

it('has method to check client subprotocol', () => {
  const app = createServer()
  const client = createClient(app)
  client.sync.remoteSubprotocol = '1.0.1'
  expect(client.isSubprotocol('>= 1.0.0')).toBeTruthy()
  expect(client.isSubprotocol('< 1.0.0')).toBeFalsy()
})

it('sends server credentials in development', () => {
  const app = createServer({ env: 'development' })
  return connectClient(app).then(client => {
    expect(sent(client)[0][4]).toEqual({
      credentials: { env: 'development' },
      subprotocol: '0.0.1'
    })
  })
})

it('does not send server credentials in production', () => {
  const app = createServer({ env: 'production' })
  app.auth(() => Promise.resolve(true))

  return connectClient(app).then(client => {
    expect(sent(client)[0][4]).toEqual({ subprotocol: '0.0.1' })
  })
})

it('disconnects zombie', () => {
  const test = createReporter()

  const client1 = createClient(test.app)
  const client2 = createClient(test.app)

  return client1.connection.connect().then(() => {
    client1.auth({ }, '10:uuid')
    return client2.connection.connect()
  }).then(() => {
    client2.auth({ }, '10:uuid')
    return Promise.resolve()
  }).then(() => {
    expect(Object.keys(test.app.clients)).toEqual([client2.key])
    expect(test.names).toEqual([
      'connect',
      'connect',
      'authenticated',
      'zombie',
      'authenticated'
    ])
    expect(test.reports[3]).toEqual(['zombie', { nodeId: '10:uuid' }])
  })
})

it('checks action creator', () => {
  const test = createReporter()
  test.app.type('GOOD', { access: () => true })
  test.app.type('BAD', { access: () => true })

  return connectClient(test.app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'GOOD' }, { id: [1, '10:uuid', 0], time: 1 },
      { type: 'BAD' }, { id: [2, '1:uuid', 0], time: 2 }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(test.names).toEqual([
      'connect', 'authenticated', 'denied', 'add', 'add', 'add'
    ])
    expect(test.reports[2]).toEqual(['denied', { actionId: [2, '1:uuid', 0] }])
    expect(test.reports[4][1].meta.id).toEqual([1, '10:uuid', 0])
    expect(actions(test.app)).toEqual([
      { type: 'logux/processed', id: [1, '10:uuid', 0] },
      { type: 'logux/undo', id: [2, '1:uuid', 0], reason: 'denied' },
      { type: 'GOOD' }
    ])
  })
})

it('allows subscribe and unsubscribe actions', () => {
  const test = createReporter()
  test.app.channel('a', { access: () => true })

  return connectClient(test.app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'logux/subscribe', channel: 'a' },
      { id: [1, '10:uuid', 0], time: 1 },
      { type: 'logux/unsubscribe', channel: 'b' },
      { id: [2, '10:uuid', 0], time: 2 },
      { type: 'logux/undo' },
      { id: [3, '10:uuid', 0], time: 3 }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(test.names).toEqual([
      'connect',
      'authenticated',
      'unknownType',
      'add',
      'add',
      'add',
      'unsubscribed',
      'subscribed',
      'add',
      'add'
    ])
    expect(test.reports[2][1].actionId).toEqual([3, '10:uuid', 0])
  })
})

it('checks action meta', () => {
  const test = createReporter()
  test.app.type('GOOD', { access: () => true })
  test.app.type('BAD', { access: () => true })

  return connectClient(test.app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'BAD' },
      { id: [1, '10:uuid', 0], time: 1, status: 'processed' },
      { type: 'GOOD' },
      {
        id: [2, '10:uuid', 0],
        time: 3,
        users: ['10'],
        nodeIds: ['10:uuid'],
        channels: ['user:10']
      }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(actions(test.app)).toEqual([
      { type: 'logux/processed', id: [2, '10:uuid', 0] },
      { type: 'logux/undo', id: [1, '10:uuid', 0], reason: 'denied' },
      { type: 'GOOD' }
    ])
    expect(test.names).toEqual([
      'connect', 'authenticated', 'denied', 'add', 'add', 'add'
    ])
    expect(test.reports[2][1].actionId).toEqual([1, '10:uuid', 0])
    expect(test.reports[4][1].meta.id).toEqual([2, '10:uuid', 0])
  })
})

it('ignores unknown action types', () => {
  const test = createReporter()

  return connectClient(test.app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'UNKNOWN' }, { id: [1, '10:uuid', 0], time: 1 }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(actions(test.app)).toEqual([
      { type: 'logux/undo', reason: 'error', id: [1, '10:uuid', 0] }
    ])
    expect(test.names).toEqual([
      'connect', 'authenticated', 'unknownType', 'add'])
    expect(test.reports[2]).toEqual(['unknownType', {
      actionId: [1, '10:uuid', 0], type: 'UNKNOWN'
    }])
  })
})

it('checks user access for action', () => {
  const test = createReporter({ env: 'development' })
  test.app.type('FOO', {
    access (action, meta, creator) {
      expect(creator.userId).toEqual('10')
      expect(creator.subprotocol).toEqual('0.0.0')
      expect(meta.id).toBeDefined()
      return Promise.resolve(!!action.bar)
    }
  })

  let client
  return connectClient(test.app).then(created => {
    client = created
    client.connection.send = jest.fn(client.connection.send)
    client.connection.other().send(['sync', 2,
      { type: 'FOO' }, { id: [1, '10:uuid', 0], time: 1 },
      { type: 'FOO', bar: true }, { id: [1, '10:uuid', 1], time: 1 }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(actions(test.app)).toEqual([
      { type: 'logux/processed', id: [1, '10:uuid', 1] },
      { type: 'logux/undo', reason: 'denied', id: [1, '10:uuid', 0] },
      { type: 'FOO', bar: true }
    ])
    expect(test.names).toEqual([
      'connect', 'authenticated', 'denied', 'add', 'add', 'add'])
    expect(test.reports[2][1].actionId).toEqual([1, '10:uuid', 0])
    expect(client.connection.send).toHaveBeenCalledWith([
      'debug', 'error', 'Action [1,"10:uuid",0] was denied'
    ])
  })
})

it('takes subprotocol from action meta', () => {
  const app = createServer()
  const subprotocols = []
  app.type('FOO', {
    access: () => true,
    process (action, meta, creator) {
      subprotocols.push(creator.subprotocol)
      return true
    }
  })

  return connectClient(app).then(client => {
    app.log.add(
      { type: 'FOO' },
      { id: [1, client.nodeId, 0], subprotocol: '1.0.0' }
    )
    return Promise.resolve()
  }).then(() => {
    expect(subprotocols).toEqual(['1.0.0'])
  })
})

it('reports about errors in access callback', () => {
  const err = new Error('test')

  const test = createReporter()
  test.app.type('FOO', {
    access () {
      throw err
    }
  })

  let throwed
  test.app.on('error', e => {
    throwed = e
  })

  return connectClient(test.app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'FOO', bar: true }, { id: [1, '10:uuid', 0], time: 1 }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(actions(test.app)).toEqual([
      { type: 'logux/undo', reason: 'error', id: [1, '10:uuid', 0] }
    ])
    expect(test.names).toEqual(['connect', 'authenticated', 'error', 'add'])
    expect(test.reports[2]).toEqual(['error', {
      actionId: [1, '10:uuid', 0], err
    }])
    expect(throwed).toEqual(err)
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

it('sends new actions by channel', () => {
  const app = createServer()
  app.type('FOO', { access: () => true })
  app.type('BAR', { access: () => true })

  return connectClient(app).then(client => {
    app.subscribers.foo = {
      '10:uuid': true
    }
    app.subscribers.bar = {
      '10:uuid': (action, meta, creator) => {
        expect(meta.id[1]).toEqual('server:uuid')
        expect(creator.isServer).toBeTruthy()
        return !action.secret
      }
    }
    return Promise.all([
      app.log.add({ type: 'FOO' }, { id: [1, 'server:uuid', 0] }),
      app.log.add({ type: 'FOO' }, {
        id: [2, 'server:uuid', 0], channels: ['foo']
      }),
      app.log.add({ type: 'BAR', secret: true }, {
        id: [3, 'server:uuid', 0], channels: ['bar']
      }),
      app.log.add({ type: 'BAR' }, {
        id: [4, 'server:uuid', 0], channels: ['bar']
      })
    ]).then(() => {
      client.connection.other().send(['synced', 2])
      client.connection.other().send(['synced', 4])
      return client.sync.waitFor('synchronized')
    }).then(() => {
      expect(sentNames(client)).toEqual(['connected', 'sync', 'sync'])
      expect(sent(client)[1]).toEqual([
        'sync', 2, { type: 'FOO' }, { id: [2, 'server:uuid', 0], time: 2 }
      ])
      expect(sent(client)[2]).toEqual([
        'sync', 4, { type: 'BAR' }, { id: [4, 'server:uuid', 0], time: 4 }
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

it('decompress subprotocol', () => {
  const app = createServer({ env: 'production' })
  app.type('A', { access: () => true })
  return connectClient(app).then(client => {
    client.sync.connection.other().send([
      'sync', 2,
      { type: 'A' }, { id: [1, '10:uuid', 0], time: 1 },
      { type: 'A' }, { id: [2, '10:uuid', 0], time: 2, subprotocol: '2.0.0' }
    ])
    return client.sync.connection.pair.wait('right')
  }).then(() => {
    expect(app.log.store.created[2][1].subprotocol).toEqual('2.0.0')
    expect(app.log.store.created[3][1].subprotocol).toEqual('0.0.0')
  })
})

it('has custom processor for unknown type', () => {
  const test = createReporter()
  const calls = []
  test.app.otherType({
    access () {
      calls.push('access')
      return true
    },
    process () {
      calls.push('process')
    }
  })
  return connectClient(test.app).then(client => {
    client.sync.connection.other().send([
      'sync', 1,
      { type: 'UNKOWN' }, { id: [1, '10:uuid', 0], time: 1 }
    ])
    return client.sync.connection.pair.wait('right')
  }).then(() => {
    expect(test.names).toEqual([
      'connect', 'authenticated', 'add', 'processed', 'add'
    ])
    expect(calls).toEqual(['access', 'process'])
  })
})

it('allows to reports about unknown type in custom processor', () => {
  const test = createReporter()
  const calls = []
  test.app.otherType({
    access (action, meta) {
      calls.push('access')
      test.app.unknownType(action, meta)
      return true
    },
    process () {
      calls.push('process')
    }
  })
  return connectClient(test.app).then(client => {
    client.sync.connection.other().send([
      'sync', 1,
      { type: 'UNKOWN' }, { id: [1, '10:uuid', 0], time: 1 }
    ])
    return client.sync.connection.pair.wait('right')
  }).then(() => {
    expect(test.names).toEqual([
      'connect', 'authenticated', 'unknownType', 'add'
    ])
    expect(calls).toEqual(['access'])
  })
})
