var TestPair = require('logux-sync').TestPair

var BaseServer = require('../base-server')
var Client = require('../client')

function createConnection () {
  var pair = new TestPair()
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
  if (!opts) {
    opts = {
      subprotocol: '0.0.0',
      supports: '0.x'
    }
  }
  return new BaseServer(opts, reporter)
}

function createReporter () {
  var reports = []
  var app = createServer(undefined, function () {
    reports.push(Array.prototype.slice.call(arguments, 0))
  })
  return { app: app, reports: reports }
}

it('uses server options', function () {
  var app = createServer({
    nodeId: 'server',
    subprotocol: '0.0.0',
    supports: '0.x',
    timeout: 16000,
    ping: 8000
  })
  var client = new Client(app, createConnection(), 1)

  expect(client.sync.options.subprotocol).toEqual('0.0.0')
  expect(client.sync.options.timeout).toEqual(16000)
  expect(client.sync.options.ping).toEqual(8000)
})

it('saves connection', function () {
  var connection = createConnection()
  var client = new Client(createServer(), connection, 1)
  expect(client.connection).toBe(connection)
})

it('use string key', function () {
  var client = new Client(createServer(), createConnection(), 1)
  expect(client.key).toEqual('1')
  expect(typeof client.key).toEqual('string')
})

it('has remote address shortcut', function () {
  var client = new Client(createServer(), createConnection(), 1)
  expect(client.remoteAddress).toEqual('127.0.0.1')
})

it('removes itself on destroy', function () {
  var test = createReporter()

  var client = new Client(test.app, createConnection(), 1)
  test.app.clients[1] = client

  return client.connection.connect().then(function () {
    client.destroy()
    expect(test.app.clients).toEqual({ })
    expect(client.connection.connected).toBeFalsy()
    expect(test.reports).toEqual([['disconnect', test.app, client]])
  })
})

it('destroys on disconnect', function () {
  var client = new Client(createServer(), createConnection(), 1)
  client.destroy = jest.fn()
  return client.connection.connect().then(function () {
    client.connection.other().disconnect()
    return client.connection.pair.wait()
  }).then(function () {
    expect(client.destroy).toBeCalled()
  })
})

it('reports on wrong authentication', function () {
  var test = createReporter()
  test.app.auth(function () {
    return Promise.resolve(false)
  })
  var client = new Client(test.app, createConnection(), 1)
  return client.connection.connect().then(function () {
    var protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, 'client', 0])
    return client.connection.pair.wait('right')
  }).then(function () {
    expect(test.reports.length).toEqual(2)
    expect(test.reports[0][0]).toEqual('unauthenticated')
    expect(test.reports[0][1]).toEqual(test.app)
    expect(test.reports[0][2]).toEqual(client)
    expect(test.reports[1][0]).toEqual('disconnect')
  })
})

it('authenticates user', function () {
  var test = createReporter()
  test.app.auth(function (id, token, who) {
    if (token === 'token' && id === '10' && who === client) {
      return Promise.resolve({ name: 'user' })
    } else {
      return Promise.resolve(false)
    }
  })
  var client = new Client(test.app, createConnection(), 1)
  return client.connection.connect().then(function () {
    var protocol = client.sync.localProtocol
    client.connection.other().send([
      'connect', protocol, '10:random', 0, { credentials: 'token' }
    ])
    return client.connection.pair.wait('right')
  }).then(function () {
    expect(client.id).toEqual('10')
    expect(client.user).toEqual({ name: 'user' })
    expect(client.nodeId).toEqual('10:random')
    expect(client.sync.authenticated).toBeTruthy()
    expect(test.reports).toEqual([['authenticated', test.app, client]])
  })
})

it('reports about synchronization errors', function () {
  var test = createReporter()
  var client = new Client(test.app, createConnection(), 1)
  return client.connection.connect().then(function () {
    client.connection.other().send(['error', 'wrong-format'])
    return client.connection.pair.wait()
  }).then(function () {
    expect(test.reports[0][0]).toEqual('syncError')
    expect(test.reports[0][1]).toEqual(test.app)
    expect(test.reports[0][2]).toEqual(client)
    expect(test.reports[0][3].type).toEqual('wrong-format')
  })
})

it('checks subprotocol', function () {
  var test = createReporter()
  var client = new Client(test.app, createConnection(), 1)
  return client.connection.connect().then(function () {
    var protocol = client.sync.localProtocol
    client.connection.other().send([
      'connect', protocol, 'client', 0, { subprotocol: '1.0.0' }
    ])
    return client.connection.pair.wait('right')
  }).then(function () {
    expect(test.reports.length).toEqual(2)
    expect(test.reports[0][0]).toEqual('clientError')
    expect(test.reports[0][3].message).toEqual(
      'Only 0.x application subprotocols are supported, but you use 1.0.0')
    expect(test.reports[1][0]).toEqual('disconnect')
  })
})

it('has method to check client subprotocol', function () {
  var test = createReporter()
  var client = new Client(test.app, createConnection(), 1)
  client.sync.remoteSubprotocol = '1.0.1'
  expect(client.isSubprotocol('>= 1.0.0')).toBeTruthy()
  expect(client.isSubprotocol('< 1.0.0')).toBeFalsy()
})

it('sends server credentials in development', function () {
  var app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    env: 'development'
  })
  app.auth(function () {
    return Promise.resolve({ id: 'user' })
  })
  var client = new Client(app, createConnection(), 1)
  return client.connection.connect().then(function () {
    var protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, 'client', 0])
    return client.connection.pair.wait('right')
  }).then(function () {
    expect(client.connection.pair.leftSent[0][4]).toEqual({
      credentials: { env: 'development' },
      subprotocol: '0.0.0'
    })
  })
})

it('does not send server credentials in production', function () {
  var app = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    env: 'production'
  })
  app.auth(function () {
    return Promise.resolve({ id: 'user' })
  })
  var client = new Client(app, createConnection(), 1)
  return client.connection.connect().then(function () {
    var protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, 'client', 0])
    return client.connection.pair.wait('right')
  }).then(function () {
    expect(client.connection.pair.leftSent[0][4]).toEqual({
      subprotocol: '0.0.0'
    })
  })
})
