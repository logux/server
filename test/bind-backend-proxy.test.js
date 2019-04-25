let { TestTime, TestPair } = require('@logux/core')
let delay = require('nanodelay')
let http = require('http')

let ServerClient = require('../server-client')
let BaseServer = require('../base-server')

let destroyable = []
let lastPort = 8111

const OPTIONS = {
  controlPassword: '1234',
  backend: 'http://127.0.0.1:8110/path'
}

const ACTION = [
  'action', { type: 'A' }, { id: '1 server:rails 0', reasons: ['test'] }
]

function createConnection () {
  let pair = new TestPair()
  pair.left.ws = {
    _socket: {
      remoteAddress: '127.0.0.1'
    }
  }
  return pair.left
}

function createClient (server) {
  server.lastClient += 1
  let client = new ServerClient(server, createConnection(), server.lastClient)
  server.connected[server.lastClient] = client
  destroyable.push(client)
  return client
}

async function connectClient (server, credentials) {
  let client = createClient(server)
  client.node.now = () => 0
  await client.connection.connect()
  let protocol = client.node.localProtocol
  client.connection.other().send(['connect', protocol, '10:uuid', 0, {
    credentials
  }])
  await client.connection.pair.wait('right')

  return client
}

function createServerWithoutAuth (options) {
  lastPort += 2
  options.time = new TestTime()
  options.port = lastPort
  options.subprotocol = '0.0.0'
  options.supports = '0.x'
  options.controlPort = lastPort + 1

  let server = new BaseServer(options)
  server.nodeId = 'server:uuid'
  server.log.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  destroyable.push(server)

  return server
}

function createServer (options) {
  let server = createServerWithoutAuth(options)
  server.auth(() => true)
  return server
}

function request ({ method, path, string, data }) {
  if (!string && data) string = JSON.stringify(data)
  return new Promise((resolve, reject) => {
    let req = http.request({
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

let httpServer = http.createServer((req, res) => {
  let body = ''
  req.on('data', data => {
    body += data
  })
  req.on('end', async () => {
    let data = JSON.parse(body)
    let actionId = data.commands[0][2].id
    sent.push([req.method, req.url, data])
    if (data.commands[0][0] === 'auth') {
      if (data.commands[0][1] === '10' && data.commands[0][2] === 'good') {
        res.write(`[["authent`)
        await delay(100)
        res.end(`icated","${ data.commands[0][3] }"]]`)
      } else {
        res.end(`[["denied","${ data.commands[0][3] }"]]`)
      }
    } else if (data.commands[0][1].type === 'NO') {
      res.statusCode = 404
      res.end()
    } else if (data.commands[0][1].type === 'BAD') {
      res.end(`[["forbidden","${ actionId }"]]`)
    } else if (data.commands[0][1].type === 'UNKNOWN') {
      res.end(`[["unknownAction","${ actionId }"]]`)
    } else if (data.commands[0][1].channel === 'unknown') {
      res.end(`[["unknownChannel","${ actionId }"]]`)
    } else if (data.commands[0][1].type === 'AERROR') {
      res.end(`[["error","stack"]]`)
    } else if (data.commands[0][1].type === 'PERROR') {
      res.write(`[["approved","${ actionId }"]`)
      await delay(100)
      res.end(`,["error","stack"]]`)
    } else if (data.commands[0][1].type === 'BROKEN1') {
      res.end(`[["approved","${ actionId }"]`)
    } else if (data.commands[0][1].type === 'BROKEN2') {
      res.end(`[["approved","${ actionId }"],"processed"]`)
    } else if (data.commands[0][1].type === 'BROKEN3') {
      res.end(`[["approved","${ actionId }"],[1]]`)
    } else if (data.commands[0][1].type === 'BROKEN4') {
      res.end(`[["approved","${ actionId }"],["procesed","${ actionId }"]]`)
    } else if (data.commands[0][1].type === 'EMPTY') {
      res.end()
    } else {
      res.write(`[["appro`)
      await delay(1)
      res.write(`ved","${ actionId }"]`)
      await delay(100)

      res.end(`,["processed","${ actionId }"]]`)
    }
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

afterEach(async () => {
  await Promise.all(destroyable.map(i => i.destroy()))
  destroyable = []
})

afterAll(() => {
  return new Promise(resolve => {
    httpServer.close(resolve)
  })
})

it('checks password option', () => {
  expect(() => {
    createServer({ backend: 'http://example.com' })
  }).toThrowError(/`controlPassword` option/)
})

it('validates HTTP requests', async () => {
  let app = createServer(OPTIONS)
  await app.listen()
  let codes = await Promise.all([
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

  expect(codes).toEqual([
    405, 404, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 403
  ])
  expect(app.log.actions()).toEqual([])
})

it('creates actions', async () => {
  let app = createServer(OPTIONS)
  await app.listen()
  let code = await send({ version: 0, password: '1234', commands: [ACTION] })

  expect(code).toEqual(200)
  expect(app.log.actions()).toEqual([{ type: 'A' }])
  expect(sent).toEqual([])
})

it('creates and processes actions', async () => {
  let app = createServer(OPTIONS)
  let processed = 0
  app.type('A', {
    access: () => true,
    process () {
      processed += 1
    }
  })
  await app.listen()
  let code = await send({ version: 0, password: '1234', commands: [ACTION] })

  expect(code).toEqual(200)
  expect(app.log.actions()).toEqual([{ type: 'A' }])
  expect(app.log.entries()[0][1].backend).toEqual('127.0.0.1')
  expect(sent).toEqual([])
  expect(processed).toEqual(1)
})

it('reports about network errors', async () => {
  let app = createServer({
    controlPassword: '1234',
    backend: 'https://127.0.0.1:7110/'
  })
  let errors = []
  app.on('error', e => {
    errors.push(e.code)
  })
  let client = await connectClient(app)
  client.connection.other().send(['sync', 1,
    { type: 'A' }, { id: [1, '10:uuid', 0], time: 1 }
  ])
  await delay(100)

  expect(errors).toEqual(['ECONNREFUSED'])
  expect(app.log.actions()).toEqual([
    { type: 'logux/undo', reason: 'error', id: '1 10:uuid 0' }
  ])
})

it('reports bad HTTP answers', async () => {
  let app = createServer(OPTIONS)
  let errors = []
  app.on('error', e => {
    errors.push(e.message)
  })
  let client = await connectClient(app)
  client.connection.other().send(['sync', 1,
    { type: 'NO' }, { id: [1, '10:uuid', 0], time: 1 }
  ])
  await delay(100)

  expect(errors).toEqual(['Backend responsed with 404 code'])
  expect(app.log.actions()).toEqual([
    { type: 'logux/undo', reason: 'error', id: '1 10:uuid 0' }
  ])
})

it('authenticates user on backend', async () => {
  let app = createServerWithoutAuth(OPTIONS)
  let client = await connectClient(app, 'good')
  expect(client.connection.connected).toBeTruthy()
  let authId = sent[0][2].commands[0][3]
  expect(typeof authId).toEqual('string')
  expect(sent).toEqual([
    [
      'POST',
      '/path',
      {
        version: 1,
        password: '1234',
        commands: [
          ['auth', '10', 'good', authId]
        ]
      }
    ]
  ])
})

it('checks user credentials', async () => {
  let app = createServerWithoutAuth(OPTIONS)
  let client = await connectClient(app, 'bad')
  expect(client.connection.connected).toBeFalsy()
  expect(client.connection.pair.leftSent).toEqual([
    ['error', 'wrong-credentials']
  ])
})

it('notifies about actions and subscriptions', async () => {
  let app = createServer(OPTIONS)
  app.on('error', e => {
    throw e
  })
  let events = []
  app.on('backendSent', (action, meta) => {
    expect(typeof action.type).toEqual('string')
    expect(typeof meta.id).toEqual('string')
    events.push('backendSent')
  })
  app.on('backendGranted', (action, meta, latency) => {
    expect(typeof action.type).toEqual('string')
    expect(typeof meta.id).toEqual('string')
    expect(latency).toBeCloseTo(50, -2)
    events.push('backendGranted')
  })
  app.on('backendProcessed', (action, meta, latency) => {
    expect(typeof action.type).toEqual('string')
    expect(typeof meta.id).toEqual('string')
    expect(latency).toBeCloseTo(100, -2)
    events.push('backendProcessed')
  })
  let client = await connectClient(app)
  client.connection.other().send(['sync', 2,
    { type: 'A' },
    { id: [1, '10:uuid', 0], time: 1 },
    { type: 'logux/subscribe', channel: 'a' },
    { id: [2, '10:uuid', 0], time: 2 }
  ])
  await delay(50)

  expect(app.log.actions()).toEqual([
    { type: 'A' },
    { type: 'logux/subscribe', channel: 'a' }
  ])
  expect(app.log.entries()[0][1].status).toEqual('waiting')
  expect(sent).toEqual([
    [
      'POST',
      '/path',
      {
        version: 1,
        password: '1234',
        commands: [
          [
            'action',
            { type: 'A' },
            { id: '1 10:uuid 0', time: 1, subprotocol: '0.0.0' }
          ]
        ]
      }
    ],
    [
      'POST',
      '/path',
      {
        version: 1,
        password: '1234',
        commands: [
          [
            'action',
            { type: 'logux/subscribe', channel: 'a' },
            {
              added: 1,
              id: '2 10:uuid 0',
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
  await delay(150)

  expect(app.log.actions()).toEqual([
    { type: 'A' },
    { type: 'logux/processed', id: '1 10:uuid 0' },
    { type: 'logux/subscribe', channel: 'a' },
    { type: 'logux/processed', id: '2 10:uuid 0' }
  ])
  expect(app.log.entries()[0][1].status).toEqual('processed')
  expect(events).toEqual([
    'backendSent', 'backendSent',
    'backendGranted', 'backendGranted',
    'backendProcessed', 'backendProcessed'
  ])
})

it('asks about action access', async () => {
  let app = createServer(OPTIONS)
  app.on('error', e => {
    throw e
  })
  let client = await connectClient(app)
  client.connection.other().send(['sync', 2,
    { type: 'BAD' }, { id: [1, '10:uuid', 0], time: 1 }
  ])
  await delay(50)

  expect(app.log.actions()).toEqual([
    { type: 'logux/undo', reason: 'denied', id: '1 10:uuid 0' }
  ])
})

it('reacts on unknown action', async () => {
  let app = createServer({ ...OPTIONS, env: 'development' })
  let errors = []
  app.on('error', e => {
    errors.push(e.message)
  })
  let client = await connectClient(app)
  client.connection.other().send(['sync', 2,
    { type: 'UNKNOWN' }, { id: [1, '10:uuid', 0], time: 1 }
  ])
  await delay(100)
  expect(app.log.actions()).toEqual([
    { type: 'logux/undo', reason: 'error', id: '1 10:uuid 0' }
  ])
  let debug = client.connection.pair.leftSent.find(i => i[0] === 'debug')
  expect(debug).toEqual(['debug', 'error', 'Action with unknown type UNKNOWN'])
})

it('reacts on unknown channel', async () => {
  let app = createServer({ ...OPTIONS, env: 'development' })
  let errors = []
  app.on('error', e => {
    errors.push(e.message)
  })
  let client = await connectClient(app)
  client.connection.other().send(['sync', 2,
    { type: 'logux/subscribe', channel: 'unknown' },
    { id: [1, '10:uuid', 0], time: 1 }
  ])
  await delay(100)
  expect(app.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'unknown' },
    { type: 'logux/undo', reason: 'error', id: '1 10:uuid 0' }
  ])
  let debug = client.connection.pair.leftSent.find(i => i[0] === 'debug')
  expect(debug).toEqual(['debug', 'error', 'Wrong channel name unknown'])
})

it('reacts on wrong backend answer', async () => {
  let app = createServer(OPTIONS)
  let errors = []
  app.on('error', e => {
    errors.push(e.message)
  })
  let client = await connectClient(app)
  client.connection.other().send(['sync', 2,
    { type: 'EMPTY' }, { id: [1, '10:uuid', 0], time: 1 },
    { type: 'BROKEN1' }, { id: [2, '10:uuid', 0], time: 1 },
    { type: 'BROKEN2' }, { id: [3, '10:uuid', 0], time: 1 },
    { type: 'BROKEN3' }, { id: [4, '10:uuid', 0], time: 1 },
    { type: 'BROKEN4' }, { id: [5, '10:uuid', 0], time: 1 }
  ])
  await delay(100)

  expect(app.log.actions()).toEqual([
    { type: 'BROKEN1' },
    { type: 'BROKEN2' },
    { type: 'BROKEN3' },
    { type: 'BROKEN4' },
    { type: 'logux/undo', reason: 'error', id: '1 10:uuid 0' },
    { type: 'logux/undo', reason: 'error', id: '2 10:uuid 0' },
    { type: 'logux/undo', reason: 'error', id: '3 10:uuid 0' },
    { type: 'logux/undo', reason: 'error', id: '4 10:uuid 0' },
    { type: 'logux/undo', reason: 'error', id: '5 10:uuid 0' }
  ])
  expect(errors).toEqual([
    'Backend wrong answer',
    'Backend wrong answer',
    'Backend wrong answer',
    'Backend wrong answer',
    'Backend wrong answer'
  ])
})

it('reacts on backend error', async () => {
  let app = createServer(OPTIONS)
  let errors = []
  app.on('error', e => {
    errors.push(e.message)
    expect(e.stack).toEqual('stack')
  })
  let client = await connectClient(app)
  client.connection.other().send(['sync', 3,
    { type: 'AERROR' }, { id: [1, '10:uuid', 0], time: 1 },
    { type: 'PERROR' }, { id: [2, '10:uuid', 0], time: 1 }
  ])
  await delay(220)

  expect(app.log.actions()).toEqual([
    { type: 'PERROR' },
    { type: 'logux/undo', reason: 'error', id: '1 10:uuid 0' },
    { type: 'logux/undo', reason: 'error', id: '2 10:uuid 0' }
  ])
  expect(errors).toEqual([
    'Backend error during access check', 'Backend error during processing'
  ])
})

it('has bruteforce protection', async () => {
  let app = createServer(OPTIONS)
  await app.listen()
  let code = await send({ version: 0, password: 'wrong', commands: [] })

  expect(code).toEqual(403)
  code = await send({ version: 0, password: 'wrong', commands: [] })

  expect(code).toEqual(403)
  code = await send({ version: 0, password: 'wrong', commands: [] })

  expect(code).toEqual(403)
  code = await send({ version: 0, password: 'wrong', commands: [] })

  expect(code).toEqual(429)
  await delay(3050)

  code = await send({ version: 0, password: 'wrong', commands: [] })

  expect(code).toEqual(403)
})
