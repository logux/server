const TestTime = require('logux-core').TestTime
const TestPair = require('logux-core').TestPair
const http = require('http')

const ServerClient = require('../server-client')
const BaseServer = require('../base-server')

let destroyable = []
let lastPort = 8111

const OPTIONS = {
  backend: {
    password: '1234',
    url: 'http://127.0.0.1:8110/path'
  }
}

const ACTION = [
  'action', { type: 'A' }, { id: [1, 'server:uuid', 0], reasons: ['test'] }
]

function createConnection () {
  const pair = new TestPair()
  pair.left.ws = {
    _socket: {
      remoteAddress: '127.0.0.1'
    }
  }
  return pair.left
}

function createClient (server) {
  server.lastClient += 1
  const client = new ServerClient(server, createConnection(), server.lastClient)
  server.clients[server.lastClient] = client
  destroyable.push(client)
  return client
}

function connectClient (server) {
  const client = createClient(server)
  client.sync.now = () => 0
  return client.connection.connect().then(() => {
    const protocol = client.sync.localProtocol
    client.connection.other().send(['connect', protocol, '10:uuid', 0])
    return client.connection.pair.wait('right')
  }).then(() => {
    return client
  })
}

function createServer (options) {
  lastPort += 2
  options.time = new TestTime()
  options.port = lastPort
  options.subprotocol = '0.0.0'
  options.supports = '0.x'
  options.backend.port = lastPort + 1

  const server = new BaseServer(options)
  server.nodeId = 'server:uuid'
  server.auth(() => true)
  server.log.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  destroyable.push(server)

  return server
}

function request ({ method, path, string, data }) {
  if (!string && data) string = JSON.stringify(data)
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: method || 'POST',
      host: '127.0.0.1',
      port: lastPort + 1,
      path: path || '/',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(string)
      }
    }, res => {
      resolve(res.statusCode)
    })
    req.on('error', reject)
    req.end(string)
  })
}

function send (data) {
  return request({ data })
}

let sent = []

const httpServer = http.createServer((req, res) => {
  let body = ''
  req.on('data', data => {
    body += data
  })
  req.on('end', () => {
    const data = JSON.parse(body)
    sent.push([req.method, req.url, data])
    if (data.commands[0][1].type === 'BAD') {
      res.write(JSON.stringify([['rejected']]))
    } else {
      res.write(JSON.stringify([['processed']]))
    }
    res.end()
  })
})

beforeAll(() => {
  return new Promise((resolve, reject) => {
    httpServer.on('error', reject)
    httpServer.listen(8110, resolve)
  })
})

beforeEach(() => {
  sent = []
})

afterEach(() => {
  return Promise.all(destroyable.map(i => i.destroy())).then(() => {
    destroyable = []
  })
})

afterAll(() => {
  return new Promise(resolve => {
    httpServer.close(resolve)
  })
})

it('checks password option', () => {
  expect(() => {
    createServer({ backend: { url: 'http://example.com' } })
  }).toThrowError(
    'For security reasons you must set strong password ' +
    'in `backend.password` option'
  )
})

it('checks url option', () => {
  expect(() => {
    createServer({ backend: { password: '123' } })
  }).toThrowError('You must set `backend.url` option with address to backend')
})

it('validates HTTP requests', () => {
  const app = createServer(OPTIONS)
  return app.listen().then(() => {
    return Promise.all([
      request({ method: 'GET', string: '' }),
      request({ path: '/logux', string: '' }),
      request({ string: '{' }),
      request({ string: '""' }),
      send({ }),
      send({ version: 100, password: '1234', commands: [] }),
      send({ version: 0, commands: [] }),
      send({ version: 0, password: '1234', commands: {} }),
      send({ version: 0, password: '1234', commands: [1] }),
      send({ version: 0, password: '1234', commands: [[1]] }),
      send({ version: 0, password: '1234', commands: [['f']] }),
      send({ version: 0, password: '1234', commands: [['action'], 'f']
      }),
      send({ version: 0, password: '1234', commands: [['action', { }, 'f']] }),
      send({ version: 0, password: 'wrong', commands: [] })
    ])
  }).then(codes => {
    expect(codes).toEqual([
      405, 404, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 403
    ])
    expect(app.log.store.created).toEqual([])
  })
})

it('creates actions', () => {
  const app = createServer(OPTIONS)
  return app.listen().then(() => {
    return send({ version: 0, password: '1234', commands: [ACTION] })
  }).then(code => {
    expect(code).toEqual(200)
    expect(app.log.actions()).toEqual([{ type: 'A' }])
    expect(sent).toEqual([])
  })
})

it('reports about HTTP errors', () => {
  const app = createServer({
    backend: {
      password: '1234',
      url: 'https://127.0.0.1:7110/'
    }
  })
  const errors = []
  app.on('error', e => {
    errors.push(e.code)
  })
  return connectClient(app).then(client => {
    client.connection.other().send(['sync', 1,
      { type: 'A' }, { id: [1, '10:uuid', 0], time: 1 }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(errors).toEqual(['ECONNREFUSED'])
  })
})

it('notifies about actions and subscriptions', () => {
  const app = createServer(OPTIONS)
  app.on('error', e => {
    throw e
  })
  return connectClient(app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'A' },
      { id: [1, '10:uuid', 0], time: 1 },
      { type: 'logux/subscribe', channel: 'a' },
      { id: [2, '10:uuid', 0], time: 2 }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(app.log.actions()).toEqual([
      { type: 'logux/processed', id: [2, '10:uuid', 0] },
      { type: 'logux/subscribe', channel: 'a' },
      { type: 'logux/processed', id: [1, '10:uuid', 0] },
      { type: 'A' }
    ])
    expect(sent).toEqual([
      [
        'POST',
        '/path',
        {
          version: 0,
          password: '1234',
          commands: [
            [
              'action',
              { type: 'A' },
              { id: [1, '10:uuid', 0], time: 1 }
            ]
          ]
        }
      ],
      [
        'POST',
        '/path',
        {
          version: 0,
          password: '1234',
          commands: [
            [
              'action',
              { type: 'logux/subscribe', channel: 'a' },
              {
                added: 1,
                id: [2, '10:uuid', 0],
                time: 2,
                reasons: ['test'],
                server: 'server:uuid',
                subprotocol: '0.0.0'
              }
            ]
          ]
        }
      ]
    ])
  })
})

it('asks about action access', () => {
  const app = createServer(OPTIONS)
  app.on('error', e => {
    throw e
  })
  return connectClient(app).then(client => {
    client.connection.other().send(['sync', 2,
      { type: 'BAD' }, { id: [1, '10:uuid', 0], time: 1 }
    ])
    return client.connection.pair.wait('right')
  }).then(() => {
    expect(app.log.actions()).toEqual([
      { type: 'logux/undo', reason: 'denied', id: [1, '10:uuid', 0] }
    ])
  })
})
