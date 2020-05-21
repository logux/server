let { LoguxError, TestPair, TestTime } = require('@logux/core')
let { delay } = require('nanodelay')

let ServerClient = require('.')
let BaseServer = require('../base-server')

let destroyable = []

function createConnection () {
  let pair = new TestPair()
  pair.left.ws = {
    _socket: {
      remoteAddress: '127.0.0.1'
    }
  }
  return pair.left
}

function createServer (opts) {
  if (!opts) opts = {}
  opts.subprotocol = '0.0.1'
  opts.supports = '0.x'
  opts.time = new TestTime()

  let server = new BaseServer(opts)
  server.auth(() => true)
  server.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  destroyable.push(server)

  return server
}

function createReporter (opts) {
  let names = []
  let reports = []

  opts = opts || {}
  opts.reporter = (name, details) => {
    names.push(name)
    reports.push([name, details])
  }

  let app = createServer(opts)
  return { app, reports, names }
}

function createClient (app) {
  app.lastClient += 1
  let client = new ServerClient(app, createConnection(), app.lastClient)
  app.connected[app.lastClient] = client
  destroyable.push(client)
  return client
}

async function connectClient (server, nodeId = '10:uuid') {
  let client = createClient(server)
  client.node.now = () => 0
  await client.connection.connect()
  let protocol = client.node.localProtocol
  client.connection.other().send(['connect', protocol, nodeId, 0])
  await client.connection.pair.wait('right')
  return client
}

function sent (client) {
  return client.node.connection.pair.leftSent
}

function sentNames (client) {
  return sent(client).map(i => i[0])
}

function actions (client) {
  let received = []
  sent(client).forEach(i => {
    if (i[0] === 'sync') {
      for (let j = 2; j < i.length; j += 2) {
        if (i[j].type !== 'logux/processed') {
          received.push(i[j])
        }
      }
    }
  })
  return received
}

afterEach(() => {
  destroyable.forEach(i => i.destroy())
  destroyable = []
})

it('uses server options', () => {
  let app = createServer({
    subprotocol: '0.0.1',
    supports: '0.x',
    timeout: 16000,
    ping: 8000
  })
  app.nodeId = 'server:x'
  let client = new ServerClient(app, createConnection(), 1)

  expect(client.node.options.subprotocol).toEqual('0.0.1')
  expect(client.node.options.timeout).toEqual(16000)
  expect(client.node.options.ping).toEqual(8000)
  expect(client.node.localNodeId).toEqual('server:x')
})

it('saves connection', () => {
  let connection = createConnection()
  let client = new ServerClient(createServer(), connection, 1)
  expect(client.connection).toBe(connection)
})

it('uses string key', () => {
  let client = new ServerClient(createServer(), createConnection(), 1)
  expect(client.key).toEqual('1')
  expect(typeof client.key).toEqual('string')
})

it('has remote address shortcut', () => {
  let client = new ServerClient(createServer(), createConnection(), 1)
  expect(client.remoteAddress).toEqual('127.0.0.1')
})

it('has default remote address if ws param does not set', () => {
  let pair = new TestPair()
  let client = new ServerClient(createServer(), pair.left, 1)
  expect(client.remoteAddress).toEqual('127.0.0.1')
})

it('reports about connection', () => {
  let test = createReporter()
  let fired = []
  test.app.on('connected', client => {
    fired.push(client.key)
  })
  new ServerClient(test.app, createConnection(), 1)
  expect(test.reports).toEqual([
    [
      'connect',
      {
        connectionId: '1',
        ipAddress: '127.0.0.1'
      }
    ]
  ])
  expect(fired).toEqual(['1'])
})

it('removes itself on destroy', async () => {
  let test = createReporter()
  let fired = []
  test.app.on('disconnected', client => {
    fired.push(client.key)
  })

  let client1 = createClient(test.app)
  let client2 = createClient(test.app)

  await client1.connection.connect()
  await client2.connection.connect()
  client1.auth('10:uuid', {})
  client2.auth('10:other', {})
  test.app.subscribers = {
    'user/10': {
      '10:uuid': client1,
      '10:other': client2
    }
  }
  await delay(1)

  client1.destroy()
  expect(test.app.userIds).toEqual({ 10: [client2] })
  expect(test.app.subscribers).toEqual({
    'user/10': { '10:other': client2 }
  })
  expect(client1.connection.connected).toBe(false)
  expect(test.names).toEqual([
    'connect',
    'connect',
    'authenticated',
    'authenticated',
    'disconnect'
  ])
  expect(test.reports[4]).toEqual(['disconnect', { nodeId: '10:uuid' }])

  client2.destroy()
  expect(test.app.connected).toEqual({})
  expect(test.app.clientIds).toEqual({})
  expect(test.app.nodeIds).toEqual({})
  expect(test.app.userIds).toEqual({})
  expect(test.app.subscribers).toEqual({})
  expect(fired).toEqual(['1', '2'])
})

it('reports client ID before authentication', async () => {
  let test = createReporter()
  let client = createClient(test.app)

  await client.connection.connect()
  client.destroy()
  expect(test.reports[1]).toEqual(['disconnect', { connectionId: '1' }])
})

it('does not report users disconnects on server destroy', async () => {
  let test = createReporter()

  let client = createClient(test.app)

  await client.connection.connect()
  test.app.destroy()
  expect(test.app.connected).toEqual({})
  expect(client.connection.connected).toBe(false)
  expect(test.names).toEqual(['connect', 'destroy'])
  expect(test.reports[1]).toEqual(['destroy', undefined])
})

it('destroys on disconnect', async () => {
  let client = createClient(createServer())
  jest.spyOn(client, 'destroy')
  await client.connection.connect()
  client.connection.other().disconnect()
  await client.connection.pair.wait()

  expect(client.destroy).toHaveBeenCalledTimes(1)
})

it('reports on wrong authentication', async () => {
  let test = createReporter()
  test.app.auth(async () => false)
  let client = new ServerClient(test.app, createConnection(), 1)
  await client.connection.connect()
  let protocol = client.node.localProtocol
  client.connection.other().send(['connect', protocol, '10:uuid', 0])
  await client.connection.pair.wait('right')

  expect(test.names).toEqual(['connect', 'unauthenticated', 'disconnect'])
  expect(test.reports[1]).toEqual([
    'unauthenticated',
    {
      connectionId: '1',
      nodeId: '10:uuid',
      subprotocol: '0.0.0'
    }
  ])
})

it('reports about authentication error', async () => {
  let test = createReporter()
  let error = new Error('test')
  let errors = []
  test.app.on('error', e => {
    errors.push(e)
  })
  test.app.auth(() => {
    throw error
  })
  let client = new ServerClient(test.app, createConnection(), 1)
  await client.connection.connect()
  let protocol = client.node.localProtocol
  client.connection.other().send(['connect', protocol, '10:uuid', 0])
  await client.connection.pair.wait('right')

  expect(test.names).toEqual(['connect', 'error', 'disconnect'])
  expect(test.reports[1]).toEqual([
    'error',
    {
      err: error,
      nodeId: '10:uuid'
    }
  ])
  expect(errors).toEqual([error])
})

it('blocks authentication bruteforce', async () => {
  let test = createReporter()
  test.app.auth(async () => false)
  async function connect (num) {
    let client = new ServerClient(test.app, createConnection(), num)
    await client.connection.connect()
    let protocol = client.node.localProtocol
    client.connection.other().send(['connect', protocol, num + ':uuid', 0])
    return client.connection.pair.wait('right')
  }
  await Promise.all([1, 2, 3, 4, 5].map(i => connect(i)))
  expect(test.names.filter(i => i === 'disconnect')).toHaveLength(5)
  expect(test.names.filter(i => i === 'unauthenticated')).toHaveLength(3)
  expect(test.names.filter(i => i === 'clientError')).toHaveLength(2)
  test.reports
    .filter(i => i[0] === 'clientError')
    .forEach(report => {
      expect(report[1].err.type).toEqual('bruteforce')
      expect(report[1].nodeId).toMatch(/(4|5):uuid/)
    })
  await delay(3050)

  await connect(6)

  expect(test.names.filter(i => i === 'disconnect')).toHaveLength(6)
  expect(test.names.filter(i => i === 'unauthenticated')).toHaveLength(4)
  expect(test.names.filter(i => i === 'clientError')).toHaveLength(2)
})

it('reports on server in user name', async () => {
  let test = createReporter()
  test.app.auth(async () => true)
  let client = new ServerClient(test.app, createConnection(), 1)
  await client.connection.connect()
  let protocol = client.node.localProtocol
  client.connection.other().send(['connect', protocol, 'server:x', 0])
  await client.connection.pair.wait('right')

  expect(test.names).toEqual(['connect', 'unauthenticated', 'disconnect'])
  expect(test.reports[1]).toEqual([
    'unauthenticated',
    {
      connectionId: '1',
      nodeId: 'server:x',
      subprotocol: '0.0.0'
    }
  ])
})

it('authenticates user', async () => {
  let test = createReporter()
  test.app.auth(
    async (id, token, who) => token === 'token' && id === 'a' && who === client
  )
  let client = createClient(test.app)

  let authenticated = []
  test.app.on('authenticated', (...args) => {
    authenticated.push(args)
  })

  await client.connection.connect()
  let protocol = client.node.localProtocol
  client.connection
    .other()
    .send(['connect', protocol, 'a:b:uuid', 0, { token: 'token' }])
  await client.connection.pair.wait('right')

  expect(client.userId).toEqual('a')
  expect(client.clientId).toEqual('a:b')
  expect(client.nodeId).toEqual('a:b:uuid')
  expect(client.node.authenticated).toBe(true)
  expect(test.app.nodeIds).toEqual({ 'a:b:uuid': client })
  expect(test.app.clientIds).toEqual({ 'a:b': client })
  expect(test.app.userIds).toEqual({ a: [client] })
  expect(test.names).toEqual(['connect', 'authenticated'])
  expect(test.reports[1]).toEqual([
    'authenticated',
    {
      connectionId: '1',
      nodeId: 'a:b:uuid',
      subprotocol: '0.0.0'
    }
  ])
  expect(authenticated).toHaveLength(1)
  expect(authenticated[0][0]).toBe(client)
  expect(typeof authenticated[0][1]).toEqual('number')
})

it('supports non-promise authenticator', async () => {
  let app = createServer()
  app.auth((id, token) => token === 'token')
  let client = createClient(app)

  await client.connection.connect()
  let protocol = client.node.localProtocol
  client.connection
    .other()
    .send(['connect', protocol, '10:uuid', 0, { token: 'token' }])
  await client.connection.pair.wait('right')

  expect(client.node.authenticated).toBe(true)
})

it('authenticates user without user name', async () => {
  let app = createServer()
  let client = createClient(app)

  await client.connection.connect()
  let protocol = client.node.localProtocol
  client.connection.other().send(['connect', protocol, 'uuid', 0])
  await client.connection.pair.wait('right')

  expect(client.userId).toBeUndefined()
  expect(app.userIds).toEqual({})
})

it('reports about synchronization errors', async () => {
  let test = createReporter()
  let client = createClient(test.app)
  await client.connection.connect()
  client.connection.other().send(['error', 'wrong-format'])
  await client.connection.pair.wait()

  expect(test.names).toEqual(['connect', 'error'])
  expect(test.reports[1]).toEqual([
    'error',
    {
      connectionId: '1',
      err: new LoguxError('wrong-format', undefined, true)
    }
  ])
})

it('checks subprotocol', async () => {
  let test = createReporter()
  let client = createClient(test.app)
  await client.connection.connect()
  let protocol = client.node.localProtocol
  client.connection
    .other()
    .send(['connect', protocol, '10:uuid', 0, { subprotocol: '1.0.0' }])
  await client.connection.pair.wait('right')

  expect(test.names).toEqual(['connect', 'clientError', 'disconnect'])
  expect(test.reports[1]).toEqual([
    'clientError',
    {
      connectionId: '1',
      err: new LoguxError('wrong-subprotocol', {
        supported: '0.x',
        used: '1.0.0'
      })
    }
  ])
})

it('has method to check client subprotocol', () => {
  let app = createServer()
  let client = createClient(app)
  client.node.remoteSubprotocol = '1.0.1'
  expect(client.isSubprotocol('>= 1.0.0')).toBe(true)
  expect(client.isSubprotocol('< 1.0.0')).toBe(false)
})

it('sends server environment in development', async () => {
  let app = createServer({ env: 'development' })
  let client = await connectClient(app)
  expect(sent(client)[0][4]).toEqual({
    subprotocol: '0.0.1',
    token: 'development'
  })
})

it('does not send server environment in production', async () => {
  let app = createServer({ env: 'production' })
  app.auth(async () => true)

  let client = await connectClient(app)
  expect(sent(client)[0][4]).toEqual({ subprotocol: '0.0.1' })
})

it('disconnects zombie', async () => {
  let test = createReporter()

  let client1 = createClient(test.app)
  let client2 = createClient(test.app)

  await client1.connection.connect()
  client1.auth('10:client:a', {})
  await client2.connection.connect()

  client2.auth('10:client:b', {})
  await delay(0)

  expect(Object.keys(test.app.connected)).toEqual([client2.key])
  expect(test.names).toEqual([
    'connect',
    'connect',
    'authenticated',
    'zombie',
    'authenticated'
  ])
  expect(test.reports[3]).toEqual(['zombie', { nodeId: '10:client:a' }])
})

it('checks action access', async () => {
  let test = createReporter()
  let finalled = 0
  test.app.type('FOO', {
    access: () => false,
    finally () {
      finalled += 1
    }
  })

  let client = await connectClient(test.app)
  client.connection
    .other()
    .send(['sync', 2, { type: 'FOO' }, { id: [1, '10:uuid', 0], time: 1 }])
  await client.connection.pair.wait('right')

  expect(test.names).toEqual(['connect', 'authenticated', 'denied', 'add'])
  expect(test.app.log.actions()).toEqual([
    { type: 'logux/undo', id: '1 10:uuid 0', reason: 'denied' }
  ])
  expect(finalled).toEqual(1)
})

it('checks action creator', async () => {
  let test = createReporter()
  test.app.type('GOOD', { access: () => true })
  test.app.type('BAD', { access: () => true })

  let client = await connectClient(test.app)
  client.connection
    .other()
    .send([
      'sync',
      2,
      { type: 'GOOD' },
      { id: [1, '10:uuid', 0], time: 1 },
      { type: 'BAD' },
      { id: [2, '1:uuid', 0], time: 2 }
    ])
  await client.connection.pair.wait('right')

  expect(test.names).toEqual([
    'connect',
    'authenticated',
    'denied',
    'add',
    'add',
    'add'
  ])
  expect(test.reports[2]).toEqual(['denied', { actionId: '2 1:uuid 0' }])
  expect(test.reports[4][1].meta.id).toEqual('1 10:uuid 0')
  expect(test.app.log.actions()).toEqual([
    { type: 'GOOD' },
    { type: 'logux/undo', id: '2 1:uuid 0', reason: 'denied' },
    { type: 'logux/processed', id: '1 10:uuid 0' }
  ])
})

it('allows subscribe and unsubscribe actions', async () => {
  let test = createReporter()
  test.app.channel('a', { access: () => true })

  let client = await connectClient(test.app)
  client.connection
    .other()
    .send([
      'sync',
      3,
      { type: 'logux/subscribe', channel: 'a' },
      { id: [1, '10:uuid', 0], time: 1 },
      { type: 'logux/unsubscribe', channel: 'b' },
      { id: [2, '10:uuid', 0], time: 2 },
      { type: 'logux/undo' },
      { id: [3, '10:uuid', 0], time: 3 }
    ])
  await client.connection.pair.wait('right')

  expect(test.names[2]).toEqual('unknownType')
  expect(test.reports[2][1].actionId).toEqual('3 10:uuid 0')
  expect(test.names).toContain('unsubscribed')
  expect(test.names).toContain('subscribed')
})

it('checks action meta', async () => {
  let test = createReporter()
  test.app.type('GOOD', { access: () => true })
  test.app.type('BAD', { access: () => true })

  test.app.log.generateId()
  test.app.log.generateId()

  let client = await connectClient(test.app)
  client.connection.other().send([
    'sync',
    2,
    { type: 'BAD' },
    { id: [1, '10:uuid', 0], time: 1, status: 'processed' },
    { type: 'GOOD' },
    {
      id: [2, '10:uuid', 0],
      time: 3,
      subprotocol: '1.0.0'
    }
  ])
  await client.connection.pair.wait('right')

  expect(test.app.log.actions()).toEqual([
    { type: 'GOOD' },
    { type: 'logux/undo', id: '1 10:uuid 0', reason: 'denied' },
    { type: 'logux/processed', id: '2 10:uuid 0' }
  ])
  expect(test.names).toEqual([
    'connect',
    'authenticated',
    'denied',
    'add',
    'add',
    'add'
  ])
  expect(test.reports[2][1].actionId).toEqual('1 10:uuid 0')
  expect(test.reports[4][1].meta.id).toEqual('2 10:uuid 0')
})

it('ignores unknown action types', async () => {
  let test = createReporter()

  let client = await connectClient(test.app)
  client.connection
    .other()
    .send(['sync', 2, { type: 'UNKNOWN' }, { id: [1, '10:uuid', 0], time: 1 }])
  await client.connection.pair.wait('right')

  expect(test.app.log.actions()).toEqual([
    { type: 'logux/undo', reason: 'unknownType', id: '1 10:uuid 0' }
  ])
  expect(test.names).toEqual(['connect', 'authenticated', 'unknownType', 'add'])
  expect(test.reports[2]).toEqual([
    'unknownType',
    {
      actionId: '1 10:uuid 0',
      type: 'UNKNOWN'
    }
  ])
})

it('checks user access for action', async () => {
  let test = createReporter({ env: 'development' })
  test.app.type('FOO', {
    async access (ctx, action, meta) {
      expect(ctx.userId).toEqual('10')
      expect(ctx.subprotocol).toEqual('0.0.0')
      expect(meta.id).toBeDefined()
      return !!action.bar
    }
  })

  let client = await connectClient(test.app)
  jest.spyOn(client.connection, 'send')
  client.connection
    .other()
    .send([
      'sync',
      2,
      { type: 'FOO' },
      { id: [1, '10:uuid', 0], time: 1 },
      { type: 'FOO', bar: true },
      { id: [1, '10:uuid', 1], time: 1 }
    ])
  await delay(50)
  expect(test.app.log.actions()).toEqual([
    { type: 'FOO', bar: true },
    { type: 'logux/undo', reason: 'denied', id: '1 10:uuid 0' },
    { type: 'logux/processed', id: '1 10:uuid 1' }
  ])
  expect(test.names).toEqual([
    'connect',
    'authenticated',
    'denied',
    'add',
    'add',
    'add'
  ])
  expect(test.reports[2][1].actionId).toEqual('1 10:uuid 0')
  expect(sent(client).find(i => i[0] === 'debug')).toEqual([
    'debug',
    'error',
    'Action "1 10:uuid 0" was denied'
  ])
})

it('takes subprotocol from action meta', async () => {
  let app = createServer()
  let subprotocols = []
  app.type('FOO', {
    access: () => true,
    process (ctx) {
      subprotocols.push(ctx.subprotocol)
      return true
    }
  })

  let client = await connectClient(app)
  app.log.add(
    { type: 'FOO' },
    { id: `1 ${client.nodeId} 0`, subprotocol: '1.0.0' }
  )
  await delay(1)

  expect(subprotocols).toEqual(['1.0.0'])
})

it('reports about errors in access callback', async () => {
  let err = new Error('test')

  let test = createReporter()
  let finalled = 0
  test.app.type('FOO', {
    access () {
      throw err
    },
    finally () {
      finalled += 1
    }
  })

  let throwed
  test.app.on('error', e => {
    throwed = e
  })

  let client = await connectClient(test.app)
  client.connection
    .other()
    .send([
      'sync',
      2,
      { type: 'FOO', bar: true },
      { id: [1, '10:uuid', 0], time: 1 }
    ])
  await client.connection.pair.wait('right')

  expect(test.app.log.actions()).toEqual([
    { type: 'logux/undo', reason: 'error', id: '1 10:uuid 0' }
  ])
  expect(test.names).toEqual(['connect', 'authenticated', 'error', 'add'])
  expect(test.reports[2]).toEqual([
    'error',
    {
      actionId: '1 10:uuid 0',
      err
    }
  ])
  expect(throwed).toEqual(err)
  expect(finalled).toEqual(1)
})

it('adds resend keys', async () => {
  let test = createReporter()
  test.app.type('FOO', {
    access: () => true,
    resend (ctx, action, meta) {
      expect(ctx.nodeId).toEqual('10:uuid')
      expect(action.type).toEqual('FOO')
      expect(meta.id).toEqual('1 10:uuid 0')
      return {
        users: ['1'],
        nodes: ['1:client:other'],
        clients: ['1:client'],
        channels: ['a']
      }
    }
  })
  test.app.type('EMPTY', {
    access: () => true,
    resend () {}
  })

  test.app.log.generateId()
  test.app.log.generateId()

  let client = await connectClient(test.app)
  client.connection
    .other()
    .send([
      'sync',
      2,
      { type: 'FOO' },
      { id: [1, '10:uuid', 0], time: 1 },
      { type: 'EMPTY' },
      { id: [2, '10:uuid', 0], time: 2 }
    ])
  await client.connection.pair.wait('right')

  expect(test.app.log.actions()).toEqual([
    { type: 'FOO' },
    { type: 'EMPTY' },
    { type: 'logux/processed', id: '2 10:uuid 0' },
    { type: 'logux/processed', id: '1 10:uuid 0' }
  ])
  expect(test.names).toEqual([
    'connect',
    'authenticated',
    'add',
    'add',
    'add',
    'add'
  ])
  expect(test.reports[2][1].action.type).toEqual('FOO')
  expect(test.reports[2][1].meta.nodes).toEqual(['1:client:other'])
  expect(test.reports[2][1].meta.clients).toEqual(['1:client'])
  expect(test.reports[2][1].meta.channels).toEqual(['a'])
  expect(test.reports[2][1].meta.users).toEqual(['1'])
  expect(test.reports[3][1].action.type).toEqual('EMPTY')
  expect(test.reports[3][1].meta.users).not.toBeDefined()
})

it('sends old actions by node ID', async () => {
  let app = createServer()
  app.type('A', { access: () => true })

  await app.log.add({ type: 'A' }, { id: '1 server:x 0' })
  await app.log.add({ type: 'A' }, { id: '2 server:x 0', nodes: ['10:uuid'] })
  let client = await connectClient(app)

  client.connection.other().send(['synced', 2])
  await client.node.waitFor('synchronized')
  expect(sentNames(client)).toEqual(['connected', 'sync'])
  expect(sent(client)[1]).toEqual([
    'sync',
    2,
    { type: 'A' },
    { id: [2, 'server:x', 0], time: 2 }
  ])
})

it('sends new actions by node ID', async () => {
  let app = createServer()
  app.type('A', { access: () => true })

  let client = await connectClient(app)
  await app.log.add({ type: 'A' }, { id: '1 server:x 0' })
  await app.log.add({ type: 'A' }, { id: '2 server:x 0', nodes: ['10:uuid'] })
  client.connection.other().send(['synced', 2])
  await delay(10)

  expect(sentNames(client)).toEqual(['connected', 'sync'])
  expect(sent(client)[1]).toEqual([
    'sync',
    2,
    { type: 'A' },
    { id: [2, 'server:x', 0], time: 2 }
  ])
})

it('sends old actions by client ID', async () => {
  let app = createServer()
  app.type('A', { access: () => true })

  await app.log.add({ type: 'A' }, { id: '1 server:x 0' })
  await app.log.add(
    { type: 'A' },
    { id: '2 server:x 0', clients: ['10:client'] }
  )
  let client = await connectClient(app, '10:client:uuid')

  client.connection.other().send(['synced', 2])
  await client.node.waitFor('synchronized')
  expect(sentNames(client)).toEqual(['connected', 'sync'])
  expect(sent(client)[1]).toEqual([
    'sync',
    2,
    { type: 'A' },
    { id: [2, 'server:x', 0], time: 2 }
  ])
})

it('sends new actions by client ID', async () => {
  let app = createServer()
  app.type('A', { access: () => true })

  let client = await connectClient(app, '10:client:uuid')
  await app.log.add({ type: 'A' }, { id: '1 server:x 0' })
  await app.log.add(
    { type: 'A' },
    { id: '2 server:x 0', clients: ['10:client'] }
  )
  client.connection.other().send(['synced', 2])
  await delay(1)

  expect(sentNames(client)).toEqual(['connected', 'sync'])
  expect(sent(client)[1]).toEqual([
    'sync',
    2,
    { type: 'A' },
    { id: [2, 'server:x', 0], time: 2 }
  ])
})

it('sends old actions by user', async () => {
  let app = createServer()
  app.type('A', { access: () => true })

  await app.log.add({ type: 'A' }, { id: '1 server:x 0' })
  await app.log.add({ type: 'A' }, { id: '2 server:x 0', users: ['10'] })
  let client = await connectClient(app)

  client.connection.other().send(['synced', 2])
  await client.node.waitFor('synchronized')
  expect(sentNames(client)).toEqual(['connected', 'sync'])
  expect(sent(client)[1]).toEqual([
    'sync',
    2,
    { type: 'A' },
    { id: [2, 'server:x', 0], time: 2 }
  ])
})

it('sends new actions by user', async () => {
  let app = createServer()
  app.type('A', { access: () => true })

  let client = await connectClient(app)
  await app.log.add({ type: 'A' }, { id: '1 server:x 0' })
  await app.log.add({ type: 'A' }, { id: '2 server:x 0', users: ['10'] })
  client.connection.other().send(['synced', 2])
  await delay(10)

  expect(sentNames(client)).toEqual(['connected', 'sync'])
  expect(sent(client)[1]).toEqual([
    'sync',
    2,
    { type: 'A' },
    { id: [2, 'server:x', 0], time: 2 }
  ])
})

it('sends new actions by channel', async () => {
  let app = createServer()
  app.type('FOO', { access: () => true })
  app.type('BAR', { access: () => true })

  let client = await connectClient(app)
  app.subscribers.foo = {
    '10:uuid': true
  }
  app.subscribers.bar = {
    '10:uuid': (ctx, action, meta) => {
      expect(meta.id).toContain(' server:x ')
      expect(ctx.isServer).toBe(true)
      return !action.secret
    }
  }
  await app.log.add({ type: 'FOO' }, { id: '1 server:x 0' })
  await app.log.add({ type: 'FOO' }, { id: '2 server:x 0', channels: ['foo'] })
  await app.log.add(
    { type: 'BAR', secret: true },
    {
      id: '3 server:x 0',
      channels: ['bar']
    }
  )
  await app.log.add({ type: 'BAR' }, { id: '4 server:x 0', channels: ['bar'] })
  client.connection.other().send(['synced', 2])
  client.connection.other().send(['synced', 4])
  await client.node.waitFor('synchronized')
  await delay(1)

  expect(sentNames(client)).toEqual(['connected', 'sync', 'sync'])
  expect(sent(client)[1]).toEqual([
    'sync',
    2,
    { type: 'FOO' },
    { id: [2, 'server:x', 0], time: 2 }
  ])
  expect(sent(client)[2]).toEqual([
    'sync',
    4,
    { type: 'BAR' },
    { id: [4, 'server:x', 0], time: 4 }
  ])
})

it('works with channel according client ID', async () => {
  let app = createServer()
  app.type('FOO', { access: () => true })
  app.type('BAR', { access: () => true })

  let client = await connectClient(app, '10:uuid:a')
  app.subscribers.foo = {
    '10:uuid:b': true,
    '10:uuid:c': true
  }
  await app.log.add({ type: 'FOO' }, { id: '2 server:x 0', channels: ['foo'] })
  client.connection.other().send(['synced', 1])
  await delay(10)

  expect(sentNames(client)).toEqual(['connected', 'sync'])
  expect(sent(client)[1]).toEqual([
    'sync',
    1,
    { type: 'FOO' },
    { id: [2, 'server:x', 0], time: 2 }
  ])
})

it('sends old action only once', async () => {
  let app = createServer()
  app.type('FOO', { access: () => true })

  await app.log.add(
    { type: 'FOO' },
    {
      id: '1 server:x 0',
      users: ['10', '10'],
      nodes: ['10:uuid', '10:uuid'],
      clients: ['10:uuid', '10:uuid']
    }
  )
  let client = await connectClient(app)

  client.connection.other().send(['synced', 2])
  await client.node.waitFor('synchronized')
  expect(sentNames(client)).toEqual(['connected', 'sync'])
  expect(sent(client)[1]).toEqual([
    'sync',
    1,
    { type: 'FOO' },
    { id: [1, 'server:x', 0], time: 1 }
  ])
})

it('sends debug back on unknown type', async () => {
  let app = createServer({ env: 'development' })
  let client1 = await connectClient(app)
  let client2 = await connectClient(app, '20:uuid')
  app.log.add({ type: 'UNKNOWN' }, { id: '1 server:x 0' })
  app.log.add({ type: 'UNKNOWN' }, { id: '2 10:uuid 0' })
  await client1.node.connection.pair.wait('right')

  expect(sent(client1)[1]).toEqual([
    'debug',
    'error',
    'Action with unknown type UNKNOWN'
  ])
  expect(sentNames(client2)).toEqual(['connected'])
})

it('does not send debug back on unknown type in production', async () => {
  let app = createServer({ env: 'production' })
  let client = await connectClient(app)
  await app.log.add({ type: 'U' }, { id: '1 10:uuid 0' })
  await client.node.connection.pair.wait('right')

  expect(sentNames(client)).toEqual(['connected', 'sync'])
})

it('decompress subprotocol', async () => {
  let app = createServer({ env: 'production' })
  app.type('A', { access: () => true })

  app.log.generateId()
  app.log.generateId()

  let client = await connectClient(app)
  client.node.connection
    .other()
    .send([
      'sync',
      2,
      { type: 'A' },
      { id: [1, '10:uuid', 0], time: 1 },
      { type: 'A' },
      { id: [2, '10:uuid', 0], time: 2, subprotocol: '2.0.0' }
    ])
  await client.node.connection.pair.wait('right')

  expect(app.log.entries()[0][1].subprotocol).toEqual('0.0.0')
  expect(app.log.entries()[1][1].subprotocol).toEqual('2.0.0')
})

it('has custom processor for unknown type', async () => {
  let test = createReporter()
  let calls = []
  test.app.otherType({
    access () {
      calls.push('access')
      return true
    },
    process () {
      calls.push('process')
    }
  })
  let client = await connectClient(test.app)
  client.node.connection
    .other()
    .send(['sync', 1, { type: 'UNKOWN' }, { id: [1, '10:uuid', 0], time: 1 }])
  await client.node.connection.pair.wait('right')

  expect(test.names).toEqual([
    'connect',
    'authenticated',
    'add',
    'processed',
    'add'
  ])
  expect(calls).toEqual(['access', 'process'])
})

it('allows to reports about unknown type in custom processor', async () => {
  let test = createReporter()
  let calls = []
  test.app.otherType({
    access (ctx, action, meta) {
      calls.push('access')
      test.app.unknownType(action, meta)
      return true
    },
    process () {
      calls.push('process')
    }
  })
  let client = await connectClient(test.app)
  client.node.connection
    .other()
    .send(['sync', 1, { type: 'UNKOWN' }, { id: [1, '10:uuid', 0], time: 1 }])
  await client.node.connection.pair.wait('right')

  expect(test.names).toEqual(['connect', 'authenticated', 'unknownType', 'add'])
  expect(calls).toEqual(['access'])
})

it('allows to use different node ID', async () => {
  let app = createServer()
  let calls = 0
  app.type('A', {
    access (ctx, action, meta) {
      expect(ctx.nodeId).toEqual('10:client:other')
      expect(meta.id).toEqual('1 10:client:other 0')
      calls += 1
      return true
    }
  })
  let client = await connectClient(app, '10:client:uuid')
  client.node.connection
    .other()
    .send([
      'sync',
      1,
      { type: 'A' },
      { id: [1, '10:client:other', 0], time: 1 }
    ])
  await client.node.connection.pair.wait('right')

  expect(calls).toEqual(1)
  expect(app.log.entries()[1][0].type).toEqual('logux/processed')
  expect(app.log.entries()[1][1].clients).toEqual(['10:client'])
})

it('allows to use different node ID only with same client ID', async () => {
  let test = createReporter()
  let client = await connectClient(test.app, '10:client:uuid')
  client.node.connection
    .other()
    .send(['sync', 1, { type: 'A' }, { id: [1, '10:clnt:uuid', 0], time: 1 }])
  await client.node.connection.pair.wait('right')

  expect(test.names).toEqual(['connect', 'authenticated', 'denied', 'add'])
})

it('has finally callback', async () => {
  let app = createServer()
  let calls = []
  let errors = []
  app.on('error', e => {
    errors.push(e.message)
  })
  app.type('A', {
    access: () => true,
    finally () {
      calls.push('A')
    }
  })
  app.type('B', {
    access: () => true,
    process: () => true,
    finally () {
      calls.push('B')
    }
  })
  app.type('C', {
    resend () {
      throw new Error('C')
    },
    access: () => true,
    finally () {
      calls.push('C')
    }
  })
  app.type('D', {
    access () {
      throw new Error('D')
    },
    finally () {
      calls.push('D')
    }
  })
  app.type('E', {
    access: () => true,
    process () {
      throw new Error('E')
    },
    finally () {
      calls.push('E')
      throw new Error('EE')
    }
  })
  let client = await connectClient(app, '10:client:uuid')
  client.node.connection
    .other()
    .send([
      'sync',
      5,
      { type: 'A' },
      { id: [1, '10:client:other', 0], time: 1 },
      { type: 'B' },
      { id: [2, '10:client:other', 0], time: 1 },
      { type: 'C' },
      { id: [3, '10:client:other', 0], time: 1 },
      { type: 'D' },
      { id: [4, '10:client:other', 0], time: 1 },
      { type: 'E' },
      { id: [5, '10:client:other', 0], time: 1 }
    ])
  await client.node.connection.pair.wait('right')

  expect(calls).toEqual(['D', 'A', 'C', 'E', 'B'])
  expect(errors).toEqual(['D', 'C', 'E', 'EE'])
})

it('sends error to author', async () => {
  let app = createServer()
  app.type('A', { access: () => true })
  let client1 = await connectClient(app, '10:1:uuid')
  let client2 = await connectClient(app, '10:2:uuid')

  client2.node.connection
    .other()
    .send(['sync', 1, { type: 'A' }, { id: [1, '10:1:uuid', 0], time: 1 }])
  await client2.node.connection.pair.wait('right')
  await delay(1)

  expect(sent(client1)).toHaveLength(1)
  expect(sent(client2)).toHaveLength(3)
})

it('does not resend actions back', async () => {
  let app = createServer()

  app.type('A', {
    access: () => true,
    resend: () => ({ users: ['10'] })
  })
  app.type('B', {
    access: () => true,
    resend: () => ({ clients: ['10:1'] })
  })
  app.type('C', {
    access: () => true,
    resend: () => ({ channels: ['all'] })
  })
  app.channel('all', { access: () => true })

  let client1 = await connectClient(app, '10:1:uuid')
  let client2 = await connectClient(app, '10:2:uuid')

  client1.node.connection
    .other()
    .send([
      'sync',
      1,
      { type: 'logux/subscribe', channel: 'all' },
      { id: [1, '10:1:uuid', 0], time: 1 }
    ])
  client2.node.connection
    .other()
    .send([
      'sync',
      1,
      { type: 'logux/subscribe', channel: 'all' },
      { id: [1, '10:2:uuid', 0], time: 1 }
    ])
  await client2.node.connection.pair.wait('right')

  client1.node.connection
    .other()
    .send([
      'sync',
      4,
      { type: 'A' },
      { id: [2, '10:1:uuid', 0], time: 2 },
      { type: 'B' },
      { id: [3, '10:1:uuid', 0], time: 3 },
      { type: 'C' },
      { id: [4, '10:1:uuid', 0], time: 4 }
    ])
  await client1.node.connection.pair.wait('right')
  await delay(10)

  expect(actions(client1)).toEqual([])
  expect(actions(client2)).toEqual([{ type: 'A' }, { type: 'C' }])
})

it('keeps context', async () => {
  let app = createServer()
  app.type('A', {
    access (ctx) {
      ctx.data.a = 1
      return true
    },
    process (ctx) {
      expect(ctx.data.a).toEqual(1)
    },
    finally (ctx) {
      expect(ctx.data.a).toEqual(1)
    }
  })

  let client = await connectClient(app, '10:1:uuid')
  client.node.connection
    .other()
    .send(['sync', 1, { type: 'A' }, { id: [1, '10:1:uuid', 0], time: 1 }])
  await client.node.connection.pair.wait('right')
  await delay(1)

  expect(sent(client)[2][2].type).toEqual('logux/processed')
})

it('uses resend for own actions', async () => {
  let app = createServer()
  app.type('FOO', {
    resend: () => ({ channel: 'foo' }),
    access: () => false
  })
  app.channel('foo', {
    access: () => true
  })
  let client = await connectClient(app, '10:1:uuid')
  client.node.connection
    .other()
    .send([
      'sync',
      1,
      { type: 'logux/subscribe', channel: 'foo' },
      { id: [1, '10:1:uuid', 0], time: 1 }
    ])
  await delay(10)

  app.log.add({ type: 'FOO' })
  await delay(10)
  expect(app.log.entries()[2][1].channels).toEqual(['foo'])
  expect(sent(client)[3][2]).toEqual({ type: 'FOO' })

  app.log.add({ type: 'FOO' }, { status: 'processed' })
  await delay(10)
  expect(app.log.entries()[3][1].channels).not.toBeDefined()
})

it('does not dublicate channel load actions', async () => {
  let app = createServer()
  app.on('FOO', {
    access: () => true,
    resend: () => ({ channel: 'foo' })
  })
  app.channel('foo', {
    access: () => true,
    async load (ctx) {
      await ctx.sendBack({ type: 'FOO' })
    }
  })
  let client = await connectClient(app, '10:1:uuid')
  client.node.connection
    .other()
    .send([
      'sync',
      1,
      { type: 'logux/subscribe', channel: 'foo' },
      { id: [1, '10:1:uuid', 0], time: 1 }
    ])
  await delay(10)

  function meta (time) {
    return { id: time, time, subprotocol: '0.0.1' }
  }
  expect(client.node.connection.pair.leftSent.slice(1)).toEqual([
    ['synced', 1],
    ['sync', 2, { type: 'FOO' }, meta(1)],
    ['sync', 3, { type: 'logux/processed', id: '1 10:1:uuid 0' }, meta(2)]
  ])
})
