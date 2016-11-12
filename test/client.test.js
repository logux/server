var BaseServer = require('../base-server')
var LocalPair = require('logux-sync').LocalPair
var Client = require('../client')

function createConnection () {
  var pair = new LocalPair()
  pair.left.ws = {
    upgradeReq: {
      headers: { },
      connection: {
        remoteAddress: '127.0.0.1'
      }
    }
  }
  pair.right.connect()
  return pair.left
}

function createServer (opts, reporter) {
  if (!opts) {
    opts = {
      nodeId: 'server',
      subprotocol: [0, 0],
      supports: [0]
    }
  }
  return new BaseServer({
    nodeId: 'server',
    subprotocol: [0, 0],
    supports: [0],
    timeout: 16000,
    ping: 8000
  }, reporter)
}

function createReporter () {
  var reports = []
  var app = createServer(undefined, function () {
    reports.push(Array.prototype.slice.call(arguments, 0))
  })
  return { app: app, reports: reports }
}

function nextTick () {
  return new Promise(function (resolve) {
    setTimeout(resolve, 1)
  })
}

it('uses server options', function () {
  var app = createServer({
    nodeId: 'server',
    subprotocol: [0, 0],
    supports: [0],
    timeout: 16000,
    ping: 8000
  })
  var client = new Client(app, createConnection(), 1)

  expect(client.sync.options.subprotocol).toEqual([0, 0])
  expect(client.sync.options.supports).toEqual([0])
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

  client.destroy()
  expect(test.app.clients).toEqual({ })
  expect(client.connection.connected).toBeFalsy()
  expect(test.reports).toEqual([['disconnect', test.app, client]])
})

it('destroys on disconnect', function () {
  var client = new Client(createServer(), createConnection(), 1)
  client.destroy = jest.fn()

  client.connection.other().disconnect()
  expect(client.destroy).toBeCalled()
})

it('reports on wrong authentication', function () {
  var test = createReporter()
  test.app.auth(function () {
    return Promise.resolve(false)
  })

  var client = new Client(test.app, createConnection(), 1)
  client.connection.other().send(['connect', client.sync.protocol, 'client', 0])

  return nextTick().then(function () {
    expect(test.reports.length).toEqual(2)
    expect(test.reports[0][0]).toEqual('clientError')
    expect(test.reports[0][1]).toEqual(test.app)
    expect(test.reports[0][2]).toEqual(client)
    expect(test.reports[0][3].message).toEqual('Wrong credentials')
    expect(test.reports[1][0]).toEqual('disconnect')
  })
})

it('authenticates user', function () {
  var test = createReporter()
  test.app.auth(function (token, nodeId, who) {
    if (token === 'token' && nodeId === 'client' && who === client) {
      return Promise.resolve({ id: 'user' })
    } else {
      return Promise.resolve(false)
    }
  })

  var client = new Client(test.app, createConnection(), 1)
  client.connection.other().send([
    'connect', client.sync.protocol, 'client', 0, { credentials: 'token' }
  ])

  return nextTick().then(function () {
    expect(client.user).toEqual({ id: 'user' })
    expect(client.nodeId).toEqual('client')
    expect(client.sync.authenticated).toBeTruthy()
    expect(test.reports).toEqual([['authenticated', test.app, client]])
  })
})

it('reports about synchronization errors', function () {
  var test = createReporter()
  var client = new Client(test.app, createConnection(), 1)

  client.connection.other().send(['error', 'wrong-format'])
  expect(test.reports[0][0]).toEqual('syncError')
  expect(test.reports[0][1]).toEqual(test.app)
  expect(test.reports[0][2]).toEqual(client)
  expect(test.reports[0][3].type).toEqual('wrong-format')
})
