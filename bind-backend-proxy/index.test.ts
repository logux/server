import { delay } from 'nanodelay'
import http from 'http'

import { TestServerOptions, TestServer } from '..'

let destroyable: { destroy(): Promise<void> }[] = []
let lastPort = 8111

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

const OPTIONS = {
  controlSecret: 'S',
  backend: 'http://127.0.0.1:8110/path'
}

const ACTION = [
  'action',
  { type: 'A' },
  { id: '1 server:rails 0', reasons: ['test'] }
]

function createServer (opts?: TestServerOptions) {
  lastPort += 1
  let server = new TestServer({
    port: lastPort,
    ...opts
  })

  server.nodeId = 'server:uuid'
  server.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  destroyable.push(server)
  return server
}

function createReporter (opts: TestServerOptions = {}) {
  let names: string[] = []
  let reports: [string, object][] = []
  let app = createServer({
    ...opts,
    reporter (name: string, details: any) {
      names.push(name)
      reports.push([name, details])
    }
  })
  return { names, reports, app }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT'
  path?: string
}

type DataRequest = RequestOptions & {
  string?: undefined
  data: object
}

type StringRequest = RequestOptions & {
  string: string
  data?: undefined
}

function request ({ method, path, string, data }: DataRequest | StringRequest) {
  let body = string ?? JSON.stringify(data)
  return new Promise<number>((resolve, reject) => {
    let req = http.request(
      {
        method: method ?? 'POST',
        host: '127.0.0.1',
        port: lastPort,
        path: path ?? '/',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      res => {
        resolve(res.statusCode)
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

function send (data: object) {
  return request({ data })
}

async function catchError (cb: () => Promise<any>) {
  let err
  try {
    await cb()
  } catch (e) {
    err = e
  }
  return err
}

let sent: [string, string, any][] = []

let httpServer = http.createServer((req, res) => {
  let body = ''
  req.on('data', data => {
    body += data
  })
  req.on('end', async () => {
    let data = JSON.parse(body)
    let actionId = data.commands[0][2].id
    sent.push([req.method ?? 'NO_METHOD', req.url ?? 'NO_URL', data])
    if (data.commands[0][0] === 'auth') {
      if (data.commands[0][1] === '10' && data.commands[0][2] === 'good') {
        res.write('[["authent')
        await delay(100)
        res.end(`icated","${data.commands[0][3]}"]]`)
      } else if (data.commands[0][2] === 'error') {
        res.end('[["error","stack"]]')
      } else if (data.commands[0][2] === 'empty') {
        res.end('')
      } else {
        res.end(`[["denied","${data.commands[0][3]}"]]`)
      }
    } else if (data.commands[0][1].type === 'NO') {
      res.statusCode = 404
      res.end()
    } else if (data.commands[0][1].type === 'BAD') {
      res.end(`[["forbidden","${actionId}"]]`)
    } else if (data.commands[0][1].type === 'UNKNOWN') {
      res.end(`[["unknownAction","${actionId}"]]`)
    } else if (data.commands[0][1].channel === 'unknown') {
      res.end(`[["unknownChannel","${actionId}"]]`)
    } else if (data.commands[0][1].type === 'AERROR') {
      res.end(`[["error","${actionId}","stack"]]`)
    } else if (data.commands[0][1].type === 'PERROR') {
      res.write(`[["approved","${actionId}"]`)
      await delay(100)
      res.end(`,["error","${actionId}","stack"]]`)
    } else if (data.commands[0][1].type === 'BROKEN1') {
      res.end(`[["approved","${actionId}"]`)
    } else if (data.commands[0][1].type === 'BROKEN2') {
      res.end(`[["approved","${actionId}"],"processed"]`)
    } else if (data.commands[0][1].type === 'BROKEN3') {
      res.end(`[["approved","${actionId}"],[1]]`)
    } else if (data.commands[0][1].type === 'BROKEN4') {
      res.end(`[["approved","${actionId}"],["procesed","${actionId}"]]`)
    } else if (data.commands[0][1].type === 'BROKEN5') {
      res.end(':')
    } else if (data.commands[0][1].type === 'BROKEN6') {
      res.end(`[["resend","${actionId}",{}],[["approved","${actionId}"]]`)
    } else if (data.commands[0][1].type === 'BROKEN7') {
      res.end(`[["processed","${actionId}"]]`)
    } else if (data.commands[0][1].type === 'BROKEN8') {
      res.end(`[["approved","${actionId}"],["resend","${actionId}",{}]]`)
    } else if (data.commands[0][1].type === 'BROKEN9') {
      res.end(`[["resend","${actionId}",1]]`)
    } else if (data.commands[0][1].type === 'BROKENA') {
      res.end(`[["resend","${actionId}",{"channels":1}]]`)
    } else if (data.commands[0][1].type === 'BROKENB') {
      res.end(`[["resend","${actionId}",{"channels":[1]}]]`)
    } else if (data.commands[0][1].channel === 'resend') {
      res.end(`[["resend","${actionId}",{}],[["approved","${actionId}"]]`)
    } else if (data.commands[0][1].type === 'EMPTY') {
      res.end()
    } else if (data.commands[0][1].type === 'RESEND') {
      res.end(`[
        ["resend","${actionId}",{"channels":["A"]}],
        ["approved","${actionId}"],
        ["processed","${actionId}"]
      ]`)
    } else {
      res.write('[["appro')
      await delay(1)
      res.write(`ved","${actionId}"]`)
      await delay(100)
      res.end(`,["processed","${actionId}"]]`)
    }
  })
})

it('checks secret option', () => {
  expect(() => {
    createServer({ backend: 'http://example.com' })
  }).toThrow(/`controlSecret` option/)
})

it('validates HTTP requests', async () => {
  let prefix = { version: 3, secret: 'S' }
  let test = createReporter(OPTIONS)
  await test.app.listen()

  expect(await request({ method: 'PUT', string: '' })).toEqual(405)
  expect(await request({ path: '/logux', string: '' })).toEqual(404)
  expect(await request({ string: '{' })).toEqual(400)
  expect(await request({ string: '""' })).toEqual(400)
  expect(await send({})).toEqual(400)
  expect(await send({ version: 100, secret: 'S', commands: [] })).toEqual(400)
  expect(await send({ version: 3, commands: [] })).toEqual(400)
  expect(await send({ ...prefix, commands: {} })).toEqual(400)
  expect(await send({ ...prefix, commands: [1] })).toEqual(400)
  expect(await send({ ...prefix, commands: [[1]] })).toEqual(400)
  expect(await send({ ...prefix, commands: [['f']] })).toEqual(400)
  expect(await send({ ...prefix, commands: [['action'], 'f'] })).toEqual(400)
  expect(await send({ ...prefix, commands: [['action', {}, '']] })).toEqual(400)
  expect(await send({ version: 3, secret: 'wrong', commands: [] })).toEqual(403)
  expect(test.app.log.actions()).toEqual([])
  expect(test.reports[1]).toEqual([
    'wrongControlSecret',
    { ipAddress: '127.0.0.1', wrongSecret: 'wrong' }
  ])
})

it('creates actions', async () => {
  let app = createServer(OPTIONS)
  await app.listen()
  let code = await send({ version: 3, secret: 'S', commands: [ACTION] })
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
  let code = await send({ version: 3, secret: 'S', commands: [ACTION] })

  expect(code).toEqual(200)
  expect(app.log.actions()).toEqual([{ type: 'A' }])
  expect(app.log.entries()[0][1].backend).toEqual('127.0.0.1')
  expect(sent).toEqual([])
  expect(processed).toEqual(1)
})

it('reports about network errors', async () => {
  let app = createServer({
    controlSecret: 'S',
    backend: 'https://localhost:7110/'
  })
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })
  let client = await app.connect('10')
  client.log.add({ type: 'A' })
  await delay(100)

  expect(errors).toEqual(['connect ECONNREFUSED 127.0.0.1:7110'])
  expect(app.log.actions()).toEqual([
    { type: 'logux/undo', reason: 'error', id: '1 10:1:1 0' }
  ])
})

it('reports bad HTTP answers', async () => {
  let app = createServer(OPTIONS)
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })
  let client = await app.connect('10')
  client.log.add({ type: 'NO' })
  await delay(100)

  expect(errors).toEqual(['Backend responsed with 404 code'])
  expect(app.log.actions()).toEqual([
    { type: 'logux/undo', reason: 'error', id: '1 10:1:1 0' }
  ])
})

it('authenticates user on backend', async () => {
  let app = createServer({ ...OPTIONS, auth: false })
  let client = await app.connect('10', { token: 'good' })
  expect(client.pair.left.connected).toBe(true)
  let authId = sent[0][2].commands[0][3]
  expect(typeof authId).toEqual('string')
  expect(sent).toEqual([
    [
      'POST',
      '/path',
      {
        version: 3,
        secret: 'S',
        commands: [['auth', '10', 'good', authId]]
      }
    ]
  ])
})

it('checks user credentials', async () => {
  let app = createServer({ ...OPTIONS, auth: false })
  let error = await catchError(() => app.connect('10', { token: 'bad' }))
  expect(error.message).toEqual('Wrong credentials')
})

it('process errors during authentication', async () => {
  let app = createServer({ ...OPTIONS, auth: false })
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })
  app.connect('10', { token: 'error' })
  await delay(100)
  expect(app.connected.size).toEqual(0)
  expect(errors).toEqual(['Error on back-end server'])
})

it('process wrong answer during authentication', async () => {
  let app = createServer({ ...OPTIONS, auth: false })
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })
  app.connect('10', { token: 'empty' })
  await delay(100)
  expect(app.connected.size).toEqual(0)
  expect(errors).toEqual(['Empty back-end answer'])
})

it('notifies about actions and subscriptions', async () => {
  let app = createServer(OPTIONS)
  app.on('error', e => {
    throw e
  })
  let events: string[] = []
  app.on('backendSent', (action, meta) => {
    expect(typeof action.type).toEqual('string')
    expect(typeof meta.id).toEqual('string')
    events.push('backendSent')
  })
  app.on('backendGranted', (action, meta, latency) => {
    expect(typeof action.type).toEqual('string')
    expect(typeof meta.id).toEqual('string')
    expect(latency > 1 && latency < 500).toBe(true)
    events.push('backendGranted')
  })
  app.on('backendProcessed', (action, meta, latency) => {
    expect(typeof action.type).toEqual('string')
    expect(typeof meta.id).toEqual('string')
    expect(latency > 1 && latency < 500).toBe(true)
    events.push('backendProcessed')
  })
  let client = await app.connect('10')
  client.log.add({ type: 'A' })
  client.log.add({ type: 'logux/subscribe', channel: 'a' })
  await delay(100)

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
        version: 3,
        secret: 'S',
        commands: [
          [
            'action',
            { type: 'A' },
            { id: '1 10:1:1 0', time: 1, subprotocol: '0.0.0' }
          ]
        ]
      }
    ],
    [
      'POST',
      '/path',
      {
        version: 3,
        secret: 'S',
        commands: [
          [
            'action',
            { type: 'logux/subscribe', channel: 'a' },
            {
              added: 1,
              id: '2 10:1:1 0',
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
    { type: 'logux/subscribe', channel: 'a' },
    { type: 'logux/processed', id: '1 10:1:1 0' },
    { type: 'logux/processed', id: '2 10:1:1 0' }
  ])
  expect(app.log.entries()[0][1].status).toEqual('processed')
  expect(events).toEqual([
    'backendSent',
    'backendSent',
    'backendGranted',
    'backendGranted',
    'backendProcessed',
    'backendProcessed'
  ])
})

it('asks about action access', async () => {
  let app = createServer(OPTIONS)
  app.on('error', e => {
    throw e
  })
  let client = await app.connect('10')
  client.log.add({ type: 'BAD' })
  await delay(50)

  expect(app.log.actions()).toEqual([
    { type: 'logux/undo', reason: 'denied', id: '1 10:1:1 0' }
  ])
})

it('reacts on unknown action', async () => {
  let app = createServer({ ...OPTIONS, env: 'development' })
  let errors = []
  app.on('error', e => {
    errors.push(e.message)
  })
  let client = await app.connect('10')
  client.log.add({ type: 'UNKNOWN' })
  await delay(100)
  expect(app.log.actions()).toEqual([
    { type: 'logux/undo', reason: 'unknownType', id: '1 10:1:1 0' }
  ])
  let debug = client.pair.rightSent.find(i => i[0] === 'debug')
  expect(debug).toEqual(['debug', 'error', 'Action with unknown type UNKNOWN'])
})

it('reacts on unknown channel', async () => {
  let app = createServer({ ...OPTIONS, env: 'development' })
  let errors = []
  app.on('error', e => {
    errors.push(e.message)
  })
  let client = await app.connect('10')
  client.log.add({ type: 'logux/subscribe', channel: 'unknown' })
  await delay(100)
  expect(app.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'unknown' },
    { type: 'logux/undo', reason: 'wrongChannel', id: '1 10:1:1 0' }
  ])
  let debug = client.pair.rightSent.find(i => i[0] === 'debug')
  expect(debug).toEqual(['debug', 'error', 'Wrong channel name unknown'])
})

it('reacts on wrong backend answer', async () => {
  let app = createServer(OPTIONS)
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })
  let client = await app.connect('10')
  client.log.add({ type: 'EMPTY' })
  client.log.add({ type: 'BROKEN1' })
  client.log.add({ type: 'BROKEN2' })
  client.log.add({ type: 'BROKEN3' })
  client.log.add({ type: 'BROKEN4' })
  client.log.add({ type: 'BROKEN5' })
  client.log.add({ type: 'BROKEN6' })
  client.log.add({ type: 'BROKEN7' })
  client.log.add({ type: 'BROKEN8' })
  client.log.add({ type: 'BROKEN9' })
  client.log.add({ type: 'BROKENA' })
  client.log.add({ type: 'BROKENB' })
  client.log.add({ type: 'logux/subscribe', channel: 'resend' })
  await delay(100)

  expect(app.log.actions()).toEqual([
    { type: 'BROKEN1' },
    { type: 'BROKEN2' },
    { type: 'BROKEN3' },
    { type: 'BROKEN4' },
    { type: 'BROKEN8' },
    { type: 'logux/subscribe', channel: 'resend' },
    { type: 'logux/undo', reason: 'error', id: '1 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '2 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '3 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '4 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '5 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '6 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '7 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '8 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '9 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '10 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '11 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '12 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '13 10:1:1 0' }
  ])
  expect(errors).toEqual([
    'Empty back-end answer',
    'Back-end do not send required answers',
    'Wrong back-end answer',
    'Back-end do not send required answers',
    'Unknown back-end answer',
    'Unexpected COLON(":") in state VALUE',
    'Back-end do not send required answers',
    'Processed answer was sent before access',
    'Resend answer was sent after access',
    'Wrong resend data',
    'Wrong resend data',
    'Wrong resend data',
    'Resend can be called on subscription'
  ])
})

it('reacts on backend error', async () => {
  let app = createServer(OPTIONS)
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
    expect(e.stack).toEqual('stack')
  })
  let client = await app.connect('10')
  client.log.add({ type: 'AERROR' })
  client.log.add({ type: 'PERROR' })
  await delay(220)

  expect(app.log.actions()).toEqual([
    { type: 'PERROR' },
    { type: 'logux/undo', reason: 'error', id: '1 10:1:1 0' },
    { type: 'logux/undo', reason: 'error', id: '2 10:1:1 0' }
  ])
  expect(errors).toEqual([
    'Error on back-end server',
    'Error on back-end server'
  ])
})

it('has bruteforce protection', async () => {
  let app = createServer(OPTIONS)
  await app.listen()
  let code = await send({ version: 3, secret: 'wrong', commands: [] })

  expect(code).toEqual(403)
  code = await send({ version: 3, secret: 'wrong', commands: [] })

  expect(code).toEqual(403)
  code = await send({ version: 3, secret: 'wrong', commands: [] })

  expect(code).toEqual(403)
  code = await send({ version: 3, secret: 'wrong', commands: [] })

  expect(code).toEqual(429)
  await delay(3050)

  code = await send({ version: 3, secret: 'wrong', commands: [] })

  expect(code).toEqual(403)
})

it('sets meta to resend', async () => {
  let app = createServer(OPTIONS)
  app.on('error', e => {
    throw e
  })
  let client = await app.connect('10')
  client.log.add({ type: 'RESEND' })
  await delay(50)
  expect(app.log.actions()).toEqual([
    { type: 'RESEND' },
    { type: 'logux/processed', id: '1 10:1:1 0' }
  ])
  expect(app.log.entries()[0][1].channels).toEqual(['A'])
})
