import http from 'node:http'
import { setTimeout } from 'node:timers/promises'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { BaseServer, TestServer, type TestServerOptions } from '../index.js'

let destroyable: { destroy(): Promise<void> }[] = []
let lastPort = 8111

beforeAll(() => {
  return new Promise<void>((resolve, reject) => {
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
    httpServer.close(() => {
      resolve()
    })
  })
})

const OPTIONS = {
  backend: 'http://127.0.0.1:8110/path',
  controlSecret: 'S'
}

const ACTION = {
  action: { type: 'A' },
  command: 'action',
  meta: { id: '1 server:rails 0', reasons: ['test'] }
}

function privateMethods(obj: object): any {
  return obj
}

function createServer(opts?: TestServerOptions): TestServer {
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

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT'
  path?: string
}

type DataRequest = {
  data: object
  string?: undefined
} & RequestOptions

type StringRequest = {
  data?: undefined
  string: string
} & RequestOptions

function request({
  data,
  method,
  path,
  string
}: DataRequest | StringRequest): Promise<number> {
  let body = string ?? JSON.stringify(data)
  return new Promise<number>((resolve, reject) => {
    let req = http.request(
      {
        headers: {
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'application/json'
        },
        host: '127.0.0.1',
        method: method ?? 'POST',
        path: path ?? '/',
        port: lastPort
      },
      res => {
        resolve(res.statusCode ?? 0)
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

function send(data: object): Promise<number> {
  return request({ data })
}

async function catchError(cb: () => Promise<any>): Promise<Error> {
  let err: Error | undefined
  try {
    await cb()
  } catch (e) {
    if (e instanceof Error) err = e
  }
  if (!err) throw new Error('Error was no thrown')
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
    let command = data.commands[0]
    sent.push([req.method ?? 'NO_METHOD', req.url ?? 'NO_URL', data])
    if (command.command === 'auth') {
      let id = `"authId":"${command.authId}"`
      if (command.userId === '10' && command.token === 'good') {
        res.write('[{"answer":"authent')
        await setTimeout(100)
        res.end(`icated",${id},"subprotocol":"1.0.0"}]`)
      } else if (command.userId === '30' && command.cookie.token === 'good') {
        res.end(`[{"answer":"authenticated",${id},"subprotocol":"1.0.0"}]`)
      } else if (command.token === 'error') {
        res.end(`[{"answer":"error",${id},"details":"stack"}]`)
      } else if (command.token === 'subprotocol') {
        res.end(`[{"answer":"wrongSubprotocol",${id},"supported":"^1.0"}]`)
      } else if (command.token === 'empty') {
        res.end('')
      } else {
        res.end(`[{"answer":"denied",${id}}]`)
      }
    } else {
      let id = `"id":"${command.meta.id}"`
      if (command.action.type === 'NO') {
        res.statusCode = 404
        res.end()
      } else if (command.action.type === 'BAD') {
        res.end(`[{"answer":"forbidden",${id}}]`)
      } else if (command.action.type === 'UNKNOWN') {
        res.end(`[{"answer":"unknownAction",${id}}]`)
      } else if (command.action.channel === 'unknown') {
        res.end(`[{"answer":"unknownChannel",${id}}]`)
      } else if (command.action.type === 'AERROR') {
        res.end(`[{"answer":"error",${id},"details":"stack"}]`)
      } else if (command.action.type === 'PERROR') {
        res.write(`[{"answer":"approved",${id}}`)
        await setTimeout(100)
        res.end(`,{"answer":"error",${id},"details":"stack"}]`)
      } else if (command.action.type === 'BROKEN1') {
        res.end(`[{"answer":"approved",${id}}`)
      } else if (command.action.type === 'BROKEN2') {
        res.end(`[{"answer":"approved",${id}},"processed"]`)
      } else if (command.action.type === 'BROKEN3') {
        res.end(`[{"command":"approved",${id}}]`)
      } else if (command.action.type === 'BROKEN4') {
        res.end(':')
      } else if (command.action.type === 'BROKEN5') {
        res.end(`[{"answer":"processed",${id}}]`)
      } else if (command.action.type === 'BROKEN6') {
        res.end(`[{"answer":"approved",${id}},{"answer":"resend",${id}}]`)
      } else if (command.action.type === 'BROKEN7') {
        res.end(`[{"answer":"unknown",${id}}]`)
      } else if (command.action.channel === 'resend') {
        res.end(`[{"answer":"resend",${id}},{"answer":"approved",${id}}]`)
      } else if (command.action.type === 'EMPTY') {
        res.end()
      } else if (command.action.type === 'RESEND') {
        res.end(`[
          {"answer":"resend",${id},"channels":["A"]},
          {"answer":"approved",${id}},
          {"answer":"processed",${id}}
        ]`)
      } else if (command.action.channel === 'a') {
        res.write('[{"answer":"appro')
        await setTimeout(1)
        res.write(`ved",${id}}`)
        await setTimeout(100)
        res.write(
          `,{"answer":"action",${id},` +
            '"action":{"type":"a/load1"},"meta":{"user":10}}'
        )
        res.write(
          `,{"answer":"action",${id},` +
            '"action":{"type":"a/load2"},"meta":{"user":10}}'
        )
        res.end(`,{"answer":"processed",${id}}]`)
      } else {
        res.write('[{"answer":"appro')
        await setTimeout(1)
        res.write(`ved",${id}}`)
        await setTimeout(100)
        res.end(`,{"answer":"processed",${id}}]`)
      }
    }
  })
})

it('allows to miss subprotocol with backend option', () => {
  new BaseServer({
    backend: 'http://example.com',
    controlSecret: 'secret',
    subprotocol: '1.0.0'
  })
})

it('checks secret option', () => {
  expect(() => {
    createServer({ backend: 'http://example.com' })
  }).toThrow(/`controlSecret` option/)
})

it('validates HTTP requests', async () => {
  let app = createServer(OPTIONS)
  let reports: [string, object][] = []
  app.on('report', (name: string, details: any) => {
    reports.push([name, details])
  })
  await app.listen()

  function check(...commands: any[]): Promise<number> {
    return send({ commands, secret: 'S', version: 4 })
  }

  expect(await request({ method: 'PUT', string: '' })).toEqual(405)
  expect(await request({ path: '/logux', string: '' })).toEqual(404)
  expect(await request({ string: '{' })).toEqual(400)
  expect(await request({ string: '""' })).toEqual(400)
  expect(await send({})).toEqual(400)
  expect(await send({ commands: [], secret: 'S', version: 100 })).toEqual(400)
  expect(await send({ commands: [], version: 4 })).toEqual(400)
  expect(await send({ commands: {}, secret: 'S', version: 4 })).toEqual(400)
  expect(await check(1)).toEqual(400)
  expect(await check({ command: 'auth' })).toEqual(400)
  expect(await check({ action: { type: 'A' }, command: 'action' })).toEqual(400)
  expect(await check({ action: {}, command: 'action', meta: {} })).toEqual(400)
  expect(await send({ commands: [], secret: 'wrong', version: 4 })).toEqual(403)
  expect(app.log.actions()).toEqual([])
  expect(reports[1]).toEqual([
    'wrongControlSecret',
    { ipAddress: '127.0.0.1', wrongSecret: 'wrong' }
  ])
})

it('creates actions', async () => {
  let app = createServer(OPTIONS)
  await app.listen()
  let code = await send({ commands: [ACTION], secret: 'S', version: 4 })
  expect(code).toEqual(200)
  expect(app.log.actions()).toEqual([{ type: 'A' }])
  expect(sent).toEqual([])
})

it('creates and processes actions', async () => {
  let app = createServer(OPTIONS)
  let processed = 0
  app.type('A', {
    access: () => true,
    process() {
      processed += 1
    }
  })
  await app.listen()
  let code = await send({ commands: [ACTION], secret: 'S', version: 4 })

  expect(code).toEqual(200)
  expect(app.log.actions()).toEqual([{ type: 'A' }])
  expect(app.log.entries()[0][1].backend).toEqual('127.0.0.1')
  expect(sent).toEqual([])
  expect(processed).toEqual(1)
})

it('reports about network errors', async () => {
  let app = createServer({
    backend: 'https://127.0.0.1:7111/',
    controlSecret: 'S'
  })
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })
  let client = await app.connect('10')
  client.log.add({ type: 'A' })
  await setTimeout(100)

  expect(errors).toEqual(['connect ECONNREFUSED 127.0.0.1:7111'])
  expect(app.log.actions()).toEqual([
    {
      action: { type: 'A' },
      id: '1 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    }
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
  await setTimeout(100)

  expect(errors).toEqual(['Backend responded with 404 code'])
  expect(app.log.actions()).toEqual([
    {
      action: { type: 'NO' },
      id: '1 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    }
  ])
})

it('authenticates user on backend', async () => {
  let app = createServer({ ...OPTIONS, auth: false })
  let client = await app.connect('10', {
    headers: { lang: 'fr' },
    token: 'good'
  })
  expect(privateMethods(client).node.remoteSubprotocol).toEqual('1.0.0')
  expect(app.options.subprotocol).toEqual('1.0.0')
  let authId = sent[0][2].commands[0].authId
  expect(typeof authId).toEqual('string')
  expect(sent).toEqual([
    [
      'POST',
      '/path',
      {
        commands: [
          {
            authId,
            command: 'auth',
            cookie: {},
            headers: { lang: 'fr' },
            subprotocol: '0.0.0',
            token: 'good',
            userId: '10'
          }
        ],
        secret: 'S',
        version: 4
      }
    ]
  ])
})

it('authenticates user by cookie', async () => {
  let app = createServer({ ...OPTIONS, auth: false })
  await app.connect('30', {
    cookie: { token: 'good' }
  })
  let authId = sent[0][2].commands[0].authId
  expect(typeof authId).toEqual('string')
  expect(sent).toEqual([
    [
      'POST',
      '/path',
      {
        commands: [
          {
            authId,
            command: 'auth',
            cookie: { token: 'good' },
            headers: {},
            subprotocol: '0.0.0',
            userId: '30'
          }
        ],
        secret: 'S',
        version: 4
      }
    ]
  ])
})

it('checks user credentials', async () => {
  let app = createServer({ ...OPTIONS, auth: false })
  let error = await catchError(() => app.connect('10', { token: 'bad' }))
  expect(error.message).toEqual('Wrong credentials')
})

it('processes errors during authentication', async () => {
  let app = createServer({ ...OPTIONS, auth: false })
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })

  let err = await catchError(() => app.connect('10', { token: 'error' }))
  expect(err.toString()).toContain('Wrong credentials')
  expect(app.connected.size).toEqual(0)
  expect(errors).toEqual(['Error on back-end server'])
})

it('checks subprotocol', async () => {
  let app = createServer({ ...OPTIONS, auth: false })
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })

  let err = await catchError(() => app.connect('10', { token: 'subprotocol' }))
  expect(err.toString()).toContain('Only ^1.0 application subprotocols')
})

it('process wrong answer during authentication', async () => {
  let app = createServer({ ...OPTIONS, auth: false })
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })

  let err = await catchError(() => app.connect('10', { token: 'empty' }))
  expect(err.toString()).toContain('Wrong credentials')
  expect(app.connected.size).toEqual(0)
  expect(errors).toEqual(['Empty back-end answer'])
})

it('notifies about actions and subscriptions', async () => {
  let app = createServer(OPTIONS)
  let processed = 0
  app.type('a/load1', {
    access: () => false,
    process() {
      processed += 1
    }
  })
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
  let client = await app.connect('10', { headers: { lang: 'fr' } })
  client.log.add({ type: 'A' })
  client.log.add({ channel: 'a', type: 'logux/subscribe' })
  await setTimeout(400)

  expect(app.log.actions()).toEqual([
    { type: 'A' },
    { channel: 'a', type: 'logux/subscribe' },
    {
      id: '1 10:1:1 0',
      type: 'logux/processed'
    },
    {
      type: 'a/load1'
    },
    {
      type: 'a/load2'
    },
    {
      id: '2 10:1:1 0',
      type: 'logux/processed'
    }
  ])
  expect(app.log.entries()[0][1].status).toEqual('processed')
  expect(sent).toEqual([
    [
      'POST',
      '/path',
      {
        commands: [
          {
            action: { type: 'A' },
            command: 'action',
            headers: { lang: 'fr' },
            meta: { id: '1 10:1:1 0', subprotocol: '0.0.0', time: 1 }
          }
        ],
        secret: 'S',
        version: 4
      }
    ],
    [
      'POST',
      '/path',
      {
        commands: [
          {
            action: { channel: 'a', type: 'logux/subscribe' },
            command: 'action',
            headers: { lang: 'fr' },
            meta: {
              added: 3,
              id: '2 10:1:1 0',
              reasons: ['test'],
              server: 'server:uuid',
              subprotocol: '0.0.0',
              time: 2
            }
          }
        ],
        secret: 'S',
        version: 4
      }
    ]
  ])
  await setTimeout(150)

  expect(app.log.actions()).toEqual([
    { type: 'A' },
    { channel: 'a', type: 'logux/subscribe' },
    { id: '1 10:1:1 0', type: 'logux/processed' },
    { type: 'a/load1' },
    { type: 'a/load2' },
    { id: '2 10:1:1 0', type: 'logux/processed' }
  ])
  expect(app.log.entries()[0][1].status).toEqual('processed')
  expect(events).toEqual([
    'backendSent',
    'backendGranted',
    'backendProcessed',
    'backendSent',
    'backendGranted',
    'backendProcessed'
  ])
  expect(processed).toEqual(0)
})

it('asks about action access', async () => {
  let app = createServer(OPTIONS)
  app.on('error', e => {
    throw e
  })
  let client = await app.connect('10')
  client.log.add({ type: 'BAD' })
  await setTimeout(50)

  expect(app.log.actions()).toEqual([
    {
      action: { type: 'BAD' },
      id: '1 10:1:1 0',
      reason: 'denied',
      type: 'logux/undo'
    }
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
  await setTimeout(100)
  expect(app.log.actions()).toEqual([
    {
      action: { type: 'UNKNOWN' },
      id: '1 10:1:1 0',
      reason: 'unknownType',
      type: 'logux/undo'
    }
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
  client.log.add({ channel: 'unknown', type: 'logux/subscribe' })
  await setTimeout(100)
  expect(app.log.actions()).toEqual([
    { channel: 'unknown', type: 'logux/subscribe' },
    {
      action: { channel: 'unknown', type: 'logux/subscribe' },
      id: '1 10:1:1 0',
      reason: 'wrongChannel',
      type: 'logux/undo'
    }
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
  await setTimeout(20)
  client.log.add({ type: 'BROKEN1' })
  await setTimeout(20)
  client.log.add({ type: 'BROKEN2' })
  await setTimeout(20)
  client.log.add({ type: 'BROKEN3' })
  await setTimeout(20)
  client.log.add({ type: 'BROKEN4' })
  await setTimeout(20)
  client.log.add({ type: 'BROKEN5' })
  await setTimeout(20)
  client.log.add({ type: 'BROKEN6' })
  await setTimeout(20)
  client.log.add({ type: 'BROKEN7' })
  await setTimeout(20)
  client.log.add({ channel: 'resend', type: 'logux/subscribe' })
  await setTimeout(20)

  expect(errors).toEqual([
    'Empty back-end answer',
    'Back-end do not send required answers',
    'Wrong back-end answer',
    'Wrong back-end answer',
    'Unexpected COLON(":") in state VALUE',
    'Processed answer was sent before access',
    'Resend answer was sent after access',
    'Unknown back-end answer',
    'Resend can be called on subscription'
  ])
  expect(app.log.actions()).toEqual([
    {
      action: { type: 'EMPTY' },
      id: '1 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    },
    { type: 'BROKEN1' },
    {
      action: { type: 'BROKEN1' },
      id: '3 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    },
    { type: 'BROKEN2' },
    {
      action: { type: 'BROKEN2' },
      id: '5 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    },
    {
      action: { type: 'BROKEN3' },
      id: '7 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    },
    {
      action: { type: 'BROKEN4' },
      id: '9 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    },
    {
      action: { type: 'BROKEN5' },
      id: '11 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    },
    { type: 'BROKEN6' },
    {
      action: { type: 'BROKEN6' },
      id: '13 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    },
    {
      action: { type: 'BROKEN7' },
      id: '15 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    },
    { channel: 'resend', type: 'logux/subscribe' },
    {
      action: { channel: 'resend', type: 'logux/subscribe' },
      id: '17 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    }
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
  await setTimeout(150)
  client.log.add({ type: 'PERROR' })
  await setTimeout(150)

  expect(errors).toEqual([
    'Error on back-end server',
    'Error on back-end server'
  ])
  expect(app.log.actions()).toEqual([
    {
      action: { type: 'AERROR' },
      id: '1 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    },
    { type: 'PERROR' },
    {
      action: { type: 'PERROR' },
      id: '3 10:1:1 0',
      reason: 'error',
      type: 'logux/undo'
    }
  ])
})

it('has bruteforce protection', async () => {
  let app = createServer(OPTIONS)
  await app.listen()
  let code = await send({ commands: [], secret: 'wrong', version: 4 })

  expect(code).toEqual(403)
  code = await send({ commands: [], secret: 'wrong', version: 4 })

  expect(code).toEqual(403)
  code = await send({ commands: [], secret: 'wrong', version: 4 })

  expect(code).toEqual(403)
  code = await send({ commands: [], secret: 'wrong', version: 4 })

  expect(code).toEqual(429)
  await setTimeout(3050)

  code = await send({ commands: [], secret: 'wrong', version: 4 })

  expect(code).toEqual(403)
})

it('sets meta to resend', async () => {
  let app = createServer(OPTIONS)
  app.on('error', e => {
    throw e
  })
  let client = await app.connect('10')
  client.log.add({ type: 'RESEND' })
  await setTimeout(50)
  expect(app.log.actions()).toEqual([
    { type: 'RESEND' },
    { id: '1 10:1:1 0', type: 'logux/processed' }
  ])
  expect(app.log.entries()[0][1].channels).toEqual(['A'])
})

it('receives actions without backend', async () => {
  let app = createServer({ controlSecret: 'S' })
  await app.listen()
  let code = await send({ commands: [ACTION], secret: 'S', version: 4 })
  expect(code).toEqual(200)
  expect(app.log.actions()).toEqual([{ type: 'A' }])
  expect(sent).toEqual([])
})

it('processes server actions', async () => {
  let app = createServer(OPTIONS)
  app.on('error', e => {
    throw e
  })
  app.log.add({ type: 'RESEND' })
  await setTimeout(50)
  expect(app.log.actions()).toEqual([{ type: 'RESEND' }])
  expect(app.log.entries()[0][1].status).toEqual('processed')
})
