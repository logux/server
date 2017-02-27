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
  server.auth(() => Promise.resolve(true))
  return server
}

function createReporter () {
  const reports = []
  const app = createServer({ }, function () {
    reports.push(Array.prototype.slice.call(arguments, 0))
  })
  return { app, reports }
}

let lastClient = 0
function createClient (app) {
  lastClient += 1
  const client = new Client(app, createConnection(), lastClient)
  app.clients[lastClient] = client
  return client
}

function wait (ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
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
      expect(test.reports[0][0]).toEqual('connect')
      expect(test.reports[1][0]).toEqual('authenticated')
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
    expect(test.reports[0][0]).toEqual('connect')
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
    expect(test.reports.length).toEqual(3)
    expect(test.reports[0][0]).toEqual('connect')
    expect(test.reports[1][0]).toEqual('unauthenticated')
    expect(test.reports[1][1]).toEqual(test.app)
    expect(test.reports[1][2]).toEqual(client)
    expect(test.reports[2][0]).toEqual('disconnect')
  })
})

it('authenticates user', () => {
  const test = createReporter()
  test.app.auth((id, token, who) => Promise.resolve(
    token === 'token' && id === '10' && who === client))
  const client = createClient(test.app)

  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send([
      'connect', protocol, '10:random', 0, { credentials: 'token' }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(test.app.nodeIds).toEqual({ '10:random': client })
    expect(client.user).toEqual('10')
    expect(client.nodeId).toEqual('10:random')
    expect(client.sync.authenticated).toBeTruthy()
    expect(test.reports[0][0]).toEqual('connect')
    expect(test.reports[1]).toEqual(['authenticated', test.app, client])
  })
})

it('reports about synchronization errors', () => {
  const test = createReporter()
  const client = createClient(test.app)
  return client.connection.connect().then(() => {
    client.connection.other().send(['error', 'wrong-format'])
    return client.connection.pair.wait()
  }).then(() => {
    expect(test.reports[0][0]).toEqual('connect')
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
    expect(test.reports.length).toEqual(3)
    expect(test.reports[0][0]).toEqual('connect')
    expect(test.reports[1][0]).toEqual('clientError')
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

it('waits for last processing before destroy', () => {
  const app = createServer()

  const client = createClient(app)

  const processed = []
  const started = []
  let process
  let approve

  app.type('FOO', {
    access (action, meta) {
      started.push(meta.id[0])
      return new Promise(resolve => {
        approve = resolve
      })
    },
    process (action, meta) {
      processed.push(meta.id[0])
      return new Promise(resolve => {
        process = resolve
      })
    }
  })

  let destroyed = false
  return client.sync.connection.connect().then(() => {
    client.auth({ }, '10:r')
    const meta1 = { id: [1, '10:r', 0], reasons: ['test'] }
    return app.log.add({ type: 'FOO' }, meta1)
  }).then(() => {
    approve(true)
    const meta2 = { id: [2, '10:r', 0], reasons: ['test'] }
    return app.log.add({ type: 'FOO' }, meta2)
  }).then(() => {
    app.destroy().then(() => {
      destroyed = true
    })
    return wait(1)
  }).then(() => {
    expect(destroyed).toBeFalsy()
    expect(app.processing).toEqual(1)
    expect(client.processing).toBeTruthy()

    const meta3 = { id: [3, '10:r', 0], reasons: ['test'] }
    return app.log.add({ type: 'FOO' }, meta3)
  }).then(() => {
    expect(started).toEqual([1, 2])
    approve(true)
    return wait(1)
  }).then(() => {
    expect(processed).toEqual([1])
    process()
    return wait(1)
  }).then(() => {
    expect(destroyed).toBeTruthy()
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
  })
})
