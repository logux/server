import { LoguxNotFoundError } from '@logux/actions'
import {
  type Action,
  LoguxError,
  type Message,
  type ServerConnection,
  type TestLog,
  TestPair,
  TestTime
} from '@logux/core'
import { restoreAll, type Spy, spyOn } from 'nanospy'
import { setTimeout } from 'node:timers/promises'
import { afterEach, expect, it } from 'vitest'

import {
  BaseServer,
  type BaseServerOptions,
  ResponseError,
  type ServerMeta
} from '../index.js'
import { ServerClient } from './index.js'

let destroyable: { destroy(): void }[] = []

function privateMethods(obj: object): any {
  return obj
}

function getPair(client: ServerClient): TestPair {
  return privateMethods(client.connection).pair
}

async function sendTo(client: ServerClient, msg: Message): Promise<void> {
  let pair = getPair(client)
  pair.right.send(msg)
  await pair.wait('right')
}

async function connect(
  client: ServerClient,
  nodeId: string = '10:uuid',
  details: object | undefined = undefined
): Promise<void> {
  await client.connection.connect()
  let protocol = client.node.localProtocol
  if (typeof details !== 'undefined') {
    await sendTo(client, ['connect', protocol, nodeId, 0, details])
  } else {
    await sendTo(client, [
      'connect',
      protocol,
      nodeId,
      0,
      { subprotocol: '0.0.1' }
    ])
  }
}

function createConnection(): ServerConnection {
  let pair = new TestPair()
  privateMethods(pair.left).ws = {
    _socket: {
      remoteAddress: '127.0.0.1'
    },
    upgradeReq: {
      headers: { 'user-agent': 'browser' }
    }
  }
  return pair.left as any
}

function createServer(
  opts: Partial<BaseServerOptions> = {}
): BaseServer<{ locale: string }, TestLog<ServerMeta>> {
  opts.subprotocol = '0.0.1'
  opts.supports = '0.x'
  opts.time = new TestTime()

  let server = new BaseServer<{ locale: string }, TestLog<ServerMeta>>({
    ...opts,
    subprotocol: '0.0.1',
    supports: '0.x',
    time: new TestTime()
  })
  server.auth(() => true)
  server.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  destroyable.push(server)

  return server
}

function createReporter(opts: Partial<BaseServerOptions> = {}): {
  app: BaseServer<{ locale: string }, TestLog<ServerMeta>>
  names: string[]
  reports: [string, any][]
} {
  let names: string[] = []
  let reports: [string, any][] = []

  let app = createServer(opts)
  app.on('report', (name: string, details?: any) => {
    names.push(name)
    reports.push([name, details])
  })
  return { app, names, reports }
}

function createClient(app: BaseServer): ServerClient {
  let lastClient: number = ++privateMethods(app).lastClient
  let client = new ServerClient(app, createConnection(), lastClient)
  app.connected.set(`${lastClient}`, client)
  destroyable.push(client)
  return client
}

async function connectClient(
  server: BaseServer,
  nodeId = '10:uuid'
): Promise<ServerClient> {
  let client = createClient(server)
  privateMethods(client.node).now = () => 0
  await connect(client, nodeId)
  return client
}

function sent(client: ServerClient): Message[] {
  return getPair(client).leftSent
}

function sentNames(client: ServerClient): string[] {
  return sent(client).map(i => i[0])
}

function actions(client: ServerClient): Action[] {
  let received: Action[] = []
  sent(client).forEach(i => {
    if (i[0] === 'sync') {
      for (let j = 2; j < i.length; j += 2) {
        let action: Action = i[j] as any
        if (action.type !== 'logux/processed') {
          received.push(action)
        }
      }
    }
  })
  return received
}

afterEach(() => {
  restoreAll()
  destroyable.forEach(i => {
    i.destroy()
  })
  destroyable = []
})

it('uses server options', () => {
  let app = createServer({
    ping: 8000,
    subprotocol: '0.0.1',
    supports: '0.x',
    timeout: 16000
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

it('has HTTP headers shortcut', () => {
  let client = new ServerClient(createServer(), createConnection(), 1)
  expect(client.httpHeaders['user-agent']).toEqual('browser')
})

it('has default remote address if ws param does not set', () => {
  let pair = new TestPair()
  let client = new ServerClient(createServer(), pair.left as any, 1)
  expect(client.remoteAddress).toEqual('127.0.0.1')
})

it('reports about connection', () => {
  let test = createReporter()
  let fired: string[] = []
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
  let disconnectedKeys: string[] = []
  test.app.on('disconnected', client => {
    disconnectedKeys.push(client.key)
  })
  let lastPulledReports = new Set()
  let pullNewReports = (): [string, any][] => {
    let reports = test.reports
    let result = reports.filter(x => !lastPulledReports.has(x))
    lastPulledReports = new Set(reports)
    return result
  }

  let client1 = createClient(test.app)
  let client2 = createClient(test.app)

  await client1.connection.connect()
  await client2.connection.connect()
  client1.node.remoteSubprotocol = '0.0.1'
  client2.node.remoteSubprotocol = '0.0.1'
  privateMethods(client1).auth('10:client1', {})
  privateMethods(client2).auth('10:client2', {})
  await setTimeout(1)
  expect(pullNewReports()).toMatchObject([
    ['connect', { connectionId: '1' }],
    ['connect', { connectionId: '2' }],
    ['authenticated', { connectionId: '1', nodeId: '10:client1' }],
    ['authenticated', { connectionId: '2', nodeId: '10:client2' }]
  ])

  test.app.subscribers = {
    'user/10': {
      '10:client1': { filters: { '{}': true } },
      '10:client2': { filters: { '{}': true } }
    }
  }
  let unsubscribedClientNodeIds: string[] = []
  test.app.on('unsubscribed', (action, meta, clientNodeId) => {
    unsubscribedClientNodeIds.push(clientNodeId)
    expect(test.app.nodeIds.get(clientNodeId)).toBeDefined()
  })
  client1.destroy()
  await setTimeout(1)

  expect(unsubscribedClientNodeIds).toEqual(['10:client1'])
  expect(Array.from(test.app.userIds.keys())).toEqual(['10'])
  expect(test.app.subscribers).toEqual({
    'user/10': { '10:client2': { filters: { '{}': true } } }
  })
  expect(client1.connection.connected).toBe(false)
  expect(pullNewReports()).toMatchObject([
    ['unsubscribed', { channel: 'user/10' }],
    ['disconnect', { nodeId: '10:client1' }]
  ])

  client2.destroy()
  await setTimeout(1)

  expect(unsubscribedClientNodeIds).toEqual(['10:client1', '10:client2'])
  expect(pullNewReports()).toMatchObject([
    ['unsubscribed', { channel: 'user/10' }],
    ['disconnect', { nodeId: '10:client2' }]
  ])
  expect(test.app.connected.size).toEqual(0)
  expect(test.app.clientIds.size).toEqual(0)
  expect(test.app.nodeIds.size).toEqual(0)
  expect(test.app.userIds.size).toEqual(0)
  expect(test.app.subscribers).toEqual({})
  expect(disconnectedKeys).toEqual(['1', '2'])
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
  expect(test.app.connected.size).toEqual(0)
  expect(client.connection.connected).toBe(false)
  expect(test.names).toEqual(['connect', 'destroy'])
  expect(test.reports[1]).toEqual(['destroy', undefined])
})

it('destroys on disconnect', async () => {
  let client = createClient(createServer())
  spyOn(client, 'destroy')
  await client.connection.connect()
  let pair = getPair(client)
  pair.right.disconnect()
  await pair.wait()

  expect((client.destroy as any as Spy).callCount).toEqual(1)
})

it('reports on wrong authentication', async () => {
  let test = createReporter()
  test.app.auth(async () => false)
  let client = new ServerClient(test.app, createConnection(), 1)
  await connect(client)

  expect(test.names).toEqual(['connect', 'unauthenticated', 'disconnect'])
  expect(test.reports[1]).toEqual([
    'unauthenticated',
    {
      connectionId: '1',
      nodeId: '10:uuid',
      subprotocol: '0.0.1'
    }
  ])
})

it('reports about authentication error', async () => {
  let test = createReporter()
  let error = new Error('test')
  let errors: Error[] = []
  test.app.on('error', e => {
    errors.push(e)
  })
  test.app.auth(() => {
    throw error
  })
  let client = new ServerClient(test.app, createConnection(), 1)
  await connect(client)

  expect(test.names).toEqual([
    'connect',
    'error',
    'unauthenticated',
    'disconnect'
  ])
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

  async function connectNext(num: number): Promise<void> {
    let client = new ServerClient(test.app, createConnection(), num)
    await connect(client, `${num}:uuid`)
  }

  await Promise.all([1, 2, 3, 4, 5].map(i => connectNext(i)))
  expect(test.names.filter(i => i === 'disconnect')).toHaveLength(5)
  expect(test.names.filter(i => i === 'unauthenticated')).toHaveLength(5)
  expect(test.names.filter(i => i === 'clientError')).toHaveLength(2)
  test.reports
    .filter(i => i[0] === 'clientError')
    .forEach(report => {
      expect(report[1].err.type).toEqual('bruteforce')
      expect(report[1].nodeId).toMatch(/(4|5):uuid/)
    })
  await setTimeout(3050)

  await connectNext(6)

  expect(test.names.filter(i => i === 'disconnect')).toHaveLength(6)
  expect(test.names.filter(i => i === 'unauthenticated')).toHaveLength(6)
  expect(test.names.filter(i => i === 'clientError')).toHaveLength(2)
})

it('reports on server in user name', async () => {
  let test = createReporter()
  test.app.auth(async () => true)
  let client = new ServerClient(test.app, createConnection(), 1)
  await connect(client, 'server:x')

  expect(test.names).toEqual(['connect', 'unauthenticated', 'disconnect'])
  expect(test.reports[1]).toEqual([
    'unauthenticated',
    {
      connectionId: '1',
      nodeId: 'server:x',
      subprotocol: '0.0.1'
    }
  ])
})

it('authenticates user', async () => {
  let test = createReporter()
  test.app.auth(async ({ client, headers, token, userId }) => {
    return (
      token === 'token' &&
      userId === 'a' &&
      client === testClient &&
      headers.locale === 'fr'
    )
  })
  let testClient = createClient(test.app)
  testClient.node.remoteHeaders = { locale: 'fr' }

  let authenticated: [ServerClient, number][] = []
  test.app.on('authenticated', (...args) => {
    authenticated.push(args)
  })

  await connect(testClient, 'a:b:uuid', { token: 'token' })

  expect(testClient.userId).toEqual('a')
  expect(testClient.clientId).toEqual('a:b')
  expect(testClient.nodeId).toEqual('a:b:uuid')
  expect(testClient.node.authenticated).toBe(true)
  expect(test.app.nodeIds).toEqual(new Map([['a:b:uuid', testClient]]))
  expect(test.app.clientIds).toEqual(new Map([['a:b', testClient]]))
  expect(test.app.userIds).toEqual(new Map([['a', [testClient]]]))
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
  expect(authenticated[0][0]).toBe(testClient)
  expect(typeof authenticated[0][1]).toEqual('number')
})

it('supports non-promise authenticator', async () => {
  let app = createServer()
  app.auth(({ token }) => token === 'token')
  let client = createClient(app)
  await connect(client, '10:uuid', { token: 'token' })
  expect(client.node.authenticated).toBe(true)
})

it('supports cookie based authenticator', async () => {
  let app = createServer()
  app.auth(({ cookie }) => cookie.token === 'good')
  let client = createClient(app)
  privateMethods(client.connection.ws).upgradeReq = {
    headers: {
      cookie: 'token=good; a=b'
    }
  }
  await connect(client, '10:uuid')
  expect(client.node.authenticated).toBe(true)
})

it('authenticates user without user name', async () => {
  let app = createServer()
  let client = createClient(app)

  await connect(client, 'uuid', { token: 'token' })

  expect(client.userId).toBeUndefined()
  expect(app.userIds.size).toEqual(0)
})

it('reports about synchronization errors', async () => {
  let test = createReporter()
  let client = createClient(test.app)
  await client.connection.connect()
  sendTo(client, ['error', 'wrong-format'])
  await getPair(client).wait()

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
  await connect(client, '10:uuid', { subprotocol: '1.0.0' })

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
  let headers = sent(client).find(i => i[0] === 'headers')
  expect(headers).toEqual(['headers', { env: 'development' }])
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
  client1.node.remoteSubprotocol = '0.0.1'
  privateMethods(client1).auth('10:client:a', {})

  await client2.connection.connect()
  client2.node.remoteSubprotocol = '0.0.1'
  privateMethods(client2).auth('10:client:b', {})
  await setTimeout(0)

  expect(Array.from(test.app.connected.keys())).toEqual([client2.key])
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
    finally() {
      finalled += 1
    }
  })

  let client = await connectClient(test.app)
  await sendTo(client, [
    'sync',
    2,
    { type: 'FOO' },
    { id: [1, '10:uuid', 0], time: 1 }
  ])

  expect(test.names).toEqual(['connect', 'authenticated', 'denied', 'add'])
  expect(test.app.log.actions()).toEqual([
    {
      action: { type: 'FOO' },
      id: '1 10:uuid 0',
      reason: 'denied',
      type: 'logux/undo'
    }
  ])
  expect(finalled).toEqual(1)
})

it('checks action creator', async () => {
  let test = createReporter()
  test.app.type('GOOD', { access: () => true })
  test.app.type('BAD', { access: () => true })

  let client = await connectClient(test.app)
  await sendTo(client, [
    'sync',
    2,
    { type: 'GOOD' },
    { id: [1, '10:uuid', 0], time: 1 },
    { type: 'BAD' },
    { id: [2, '1:uuid', 0], time: 2 }
  ])

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
    {
      action: { type: 'BAD' },
      id: '2 1:uuid 0',
      reason: 'denied',
      type: 'logux/undo'
    },
    { id: '1 10:uuid 0', type: 'logux/processed' }
  ])
})

it('allows subscribe and unsubscribe actions', async () => {
  let test = createReporter()
  test.app.channel('a', { access: () => true })

  let client = await connectClient(test.app)
  await sendTo(client, [
    'sync',
    3,
    { channel: 'a', type: 'logux/subscribe' },
    { id: [1, '10:uuid', 0], time: 1 },
    { channel: 'b', type: 'logux/unsubscribe' },
    { id: [2, '10:uuid', 0], time: 2 },
    { type: 'logux/undo' },
    { id: [3, '10:uuid', 0], time: 3 }
  ])

  expect(test.names[8]).toEqual('unknownType')
  expect(test.reports[8][1].actionId).toEqual('3 10:uuid 0')
  expect(test.names).toContain('unsubscribed')
  expect(test.names).toContain('subscribed')
})

it('checks action meta', async () => {
  let test = createReporter()
  test.app.type('GOOD', { access: () => true }, { queue: '1' })
  test.app.type('BAD', { access: () => true }, { queue: '2' })

  test.app.log.generateId()
  test.app.log.generateId()

  let client = await connectClient(test.app)
  await sendTo(client, [
    'sync',
    2,
    { type: 'BAD' },
    { id: [1, '10:uuid', 0], status: 'processed', time: 1 },
    { type: 'GOOD' },
    {
      id: [2, '10:uuid', 0],
      subprotocol: '1.0.0',
      time: 3
    }
  ])

  expect(test.app.log.actions()).toEqual([
    { type: 'GOOD' },
    {
      action: { type: 'BAD' },
      id: '1 10:uuid 0',
      reason: 'denied',
      type: 'logux/undo'
    },
    { id: '2 10:uuid 0', type: 'logux/processed' }
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
  await sendTo(client, [
    'sync',
    2,
    { type: 'UNKNOWN' },
    { id: [1, '10:uuid', 0], time: 1 }
  ])

  expect(test.app.log.actions()).toEqual([
    {
      action: { type: 'UNKNOWN' },
      id: '1 10:uuid 0',
      reason: 'unknownType',
      type: 'logux/undo'
    }
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
  type FooAction = {
    bar: boolean
    type: 'FOO'
  }
  test.app.type<FooAction>('FOO', {
    async access(ctx, action, meta) {
      expect(ctx.userId).toEqual('10')
      expect(ctx.subprotocol).toEqual('0.0.1')
      expect(meta.id).toBeDefined()
      return !!action.bar
    }
  })

  let client = await connectClient(test.app)
  await sendTo(client, [
    'sync',
    2,
    { bar: true, type: 'FOO' },
    { id: [1, '10:uuid', 0], time: 1 },
    { type: 'FOO' },
    { id: [1, '10:uuid', 1], time: 1 }
  ])
  await setTimeout(50)
  expect(test.app.log.actions()).toEqual([
    { bar: true, type: 'FOO' },
    { id: '1 10:uuid 0', type: 'logux/processed' },
    {
      action: { type: 'FOO' },
      id: '1 10:uuid 1',
      reason: 'denied',
      type: 'logux/undo'
    }
  ])
  expect(test.names).toEqual([
    'connect',
    'authenticated',
    'add',
    'denied',
    'add',
    'add'
  ])
  expect(test.reports.find(i => i[0] === 'denied')![1].actionId).toEqual(
    '1 10:uuid 1'
  )
  expect(sent(client).find(i => i[0] === 'debug')).toEqual([
    'debug',
    'error',
    'Action "1 10:uuid 1" was denied'
  ])
})

it('takes subprotocol from action meta', async () => {
  let app = createServer()
  let subprotocols: string[] = []
  app.type('FOO', {
    access: () => true,
    process(ctx) {
      subprotocols.push(ctx.subprotocol)
    }
  })

  let client = await connectClient(app)
  app.log.add(
    { type: 'FOO' },
    { id: `1 ${client.nodeId} 0`, subprotocol: '1.0.0' }
  )
  await setTimeout(1)

  expect(subprotocols).toEqual(['1.0.0'])
})

it('reports about errors in access callback', async () => {
  let err = new Error('test')

  let test = createReporter()
  let finalled = 0
  test.app.type('FOO', {
    access() {
      throw err
    },
    finally() {
      finalled += 1
    }
  })

  let throwed
  test.app.on('error', e => {
    throwed = e
  })

  let client = await connectClient(test.app)
  await sendTo(client, [
    'sync',
    2,
    { bar: true, type: 'FOO' },
    { id: [1, '10:uuid', 0], time: 1 }
  ])

  expect(test.app.log.actions()).toEqual([
    {
      action: { bar: true, type: 'FOO' },
      id: '1 10:uuid 0',
      reason: 'error',
      type: 'logux/undo'
    }
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
    resend(ctx, action, meta) {
      expect(ctx.nodeId).toEqual('10:uuid')
      expect(action.type).toEqual('FOO')
      expect(meta.id).toEqual('1 10:uuid 0')
      return {
        channels: ['a'],
        clients: ['1:client'],
        nodes: ['1:client:other'],
        users: ['1']
      }
    }
  })
  // @ts-expect-error
  test.app.type('EMPTY', {
    access: () => true,
    resend() {}
  })

  test.app.log.generateId()
  test.app.log.generateId()

  let client = await connectClient(test.app)
  await sendTo(client, [
    'sync',
    2,
    { type: 'FOO' },
    { id: [1, '10:uuid', 0], time: 1 },
    { type: 'EMPTY' },
    { id: [2, '10:uuid', 0], time: 2 }
  ])

  expect(test.app.log.actions()).toEqual([
    { type: 'FOO' },
    { type: 'EMPTY' },
    { id: '1 10:uuid 0', type: 'logux/processed' },
    { id: '2 10:uuid 0', type: 'logux/processed' }
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
  expect(test.reports[4][1].action.type).toEqual('EMPTY')
  expect(test.reports[4][1].meta.users).not.toBeDefined()
})

it('has channel resend shortcut', async () => {
  let app = createServer()
  app.type('FOO', {
    access: () => true,
    resend() {
      return 'bar'
    }
  })
  app.type('FOOS', {
    access: () => true,
    resend() {
      return ['bar1', 'bar2']
    }
  })

  let client = await connectClient(app)
  await sendTo(client, [
    'sync',
    2,
    { type: 'FOO' },
    { id: [1, '10:uuid', 0], time: 1 },
    { type: 'FOOS' },
    { id: [2, '10:uuid', 0], time: 2 }
  ])

  expect(app.log.actions()).toEqual([
    { type: 'FOO' },
    { id: '1 10:uuid 0', type: 'logux/processed' },
    { type: 'FOOS' },
    { id: '2 10:uuid 0', type: 'logux/processed' }
  ])
  expect(app.log.entries()[0][1].channels).toEqual(['bar'])
  expect(app.log.entries()[2][1].channels).toEqual(['bar1', 'bar2'])
})

it('sends old actions by node ID', async () => {
  let app = createServer()
  app.type('A', { access: () => true })

  await app.log.add({ type: 'A' }, { id: '1 server:x 0' })
  await app.log.add({ type: 'A' }, { id: '2 server:x 0', nodes: ['10:uuid'] })
  let client = await connectClient(app)

  sendTo(client, ['synced', 2])
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
  sendTo(client, ['synced', 2])
  await setTimeout(10)

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
    { clients: ['10:client'], id: '2 server:x 0' }
  )
  let client = await connectClient(app, '10:client:uuid')

  sendTo(client, ['synced', 2])
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
    { clients: ['10:client'], id: '2 server:x 0' }
  )
  sendTo(client, ['synced', 2])
  await setTimeout(1)

  expect(sentNames(client)).toEqual(['connected', 'sync'])
  expect(sent(client)[1]).toEqual([
    'sync',
    2,
    { type: 'A' },
    { id: [2, 'server:x', 0], time: 2 }
  ])
})

it('does not send old action on client excluding', async () => {
  let app = createServer()
  app.type('A', { access: () => true })

  await app.log.add({ type: 'A' }, { id: '1 server:x 0' })
  await app.log.add(
    { type: 'A' },
    { excludeClients: ['10:client'], id: '2 server:x 0', users: ['10'] }
  )
  let client = await connectClient(app, '10:client:uuid')

  sendTo(client, ['synced', 2])
  await client.node.waitFor('synchronized')
  expect(sentNames(client)).toEqual(['connected'])
})

it('sends old actions by user', async () => {
  let app = createServer()
  app.type('A', { access: () => true })

  await app.log.add({ type: 'A' }, { id: '1 server:x 0' })
  await app.log.add({ type: 'A' }, { id: '2 server:x 0', users: ['10'] })
  let client = await connectClient(app)

  sendTo(client, ['synced', 2])
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
  sendTo(client, ['synced', 2])
  await setTimeout(10)

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
    '10:uuid': { filters: { '{}': true } }
  }
  app.subscribers.bar = {
    '10:uuid': {
      filters: {
        '{}': (ctx, action, meta) => {
          expect(meta.id).toContain(' server:x ')
          expect(ctx.isServer).toBe(true)
          return privateMethods(action).secret !== true
        }
      }
    }
  }
  await app.log.add({ type: 'FOO' }, { id: '1 server:x 0' })
  await app.log.add({ type: 'FOO' }, { channels: ['foo'], id: '2 server:x 0' })
  await app.log.add(
    { secret: true, type: 'BAR' },
    {
      channels: ['bar'],
      id: '3 server:x 0'
    }
  )
  await app.log.add({ type: 'BAR' }, { channels: ['bar'], id: '4 server:x 0' })
  sendTo(client, ['synced', 2])
  sendTo(client, ['synced', 4])
  await client.node.waitFor('synchronized')
  await setTimeout(1)

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

it('excludes client from channel', async () => {
  let app = createServer()
  app.type('FOO', { access: () => true })

  let client1 = await connectClient(app, '10:1:uuid')
  let client2 = await connectClient(app, '10:2:uuid')
  app.subscribers.foo = {
    '10:1:uuid': { filters: { '{}': true } },
    '10:2:uuid': { filters: { '{}': true } }
  }
  await app.log.add(
    { type: 'FOO' },
    { channels: ['foo'], excludeClients: ['10:1'], id: '2 server:x 0' }
  )
  await setTimeout(10)

  expect(sentNames(client1)).toEqual(['connected'])
  expect(sentNames(client2)).toEqual(['connected', 'sync'])
  expect(sent(client2)[1]).toEqual([
    'sync',
    1,
    { type: 'FOO' },
    { id: [2, 'server:x', 0], time: 2 }
  ])
})

it('works with channel according client ID', async () => {
  let app = createServer()
  app.type('FOO', { access: () => true })
  app.type('BAR', { access: () => true })

  let client = await connectClient(app, '10:uuid:a')
  app.subscribers.foo = {
    '10:uuid:b': { filters: { '{}': true } },
    '10:uuid:c': { filters: { '{}': true } }
  }
  await app.log.add({ type: 'FOO' }, { channels: ['foo'], id: '2 server:x 0' })
  sendTo(client, ['synced', 1])
  await setTimeout(10)

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
      clients: ['10:uuid', '10:uuid'],
      id: '1 server:x 0',
      nodes: ['10:uuid', '10:uuid'],
      users: ['10', '10']
    }
  )
  let client = await connectClient(app)

  sendTo(client, ['synced', 2])
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
  await getPair(client1).wait('right')

  expect(sent(client1).find(i => i[0] === 'debug')).toEqual([
    'debug',
    'error',
    'Action with unknown type UNKNOWN'
  ])
  expect(sentNames(client2)).toEqual(['headers', 'connected'])
})

it('does not send debug back on unknown type in production', async () => {
  let app = createServer({ env: 'production' })
  let client = await connectClient(app)
  await app.log.add({ type: 'U' }, { id: '1 10:uuid 0' })
  await getPair(client).wait('right')

  expect(sentNames(client)).toEqual(['connected', 'sync'])
})

it('decompress subprotocol', async () => {
  let app = createServer({ env: 'production' })
  app.type('A', { access: () => true })

  app.log.generateId()
  app.log.generateId()

  let client = await connectClient(app)
  await sendTo(client, [
    'sync',
    2,
    { type: 'A' },
    { id: [1, '10:uuid', 0], time: 1 },
    { type: 'A' },
    { id: [2, '10:uuid', 0], subprotocol: '2.0.0', time: 2 }
  ])

  expect(app.log.entries()[0][1].subprotocol).toEqual('0.0.1')
  expect(app.log.entries()[1][1].subprotocol).toEqual('2.0.0')
})

it('has custom processor for unknown type', async () => {
  let test = createReporter()
  let calls: string[] = []
  test.app.otherType({
    access() {
      calls.push('access')
      return true
    },
    process() {
      calls.push('process')
    }
  })
  let client = await connectClient(test.app)
  await sendTo(client, [
    'sync',
    1,
    { type: 'UNKOWN' },
    { id: [1, '10:uuid', 0], time: 1 }
  ])

  expect(test.names).toEqual(['connect', 'authenticated', 'add', 'add'])
  expect(calls).toEqual(['access', 'process'])
})

it('allows to reports about unknown type in custom processor', async () => {
  let test = createReporter()
  let calls: string[] = []
  test.app.otherType({
    access(ctx, action, meta) {
      calls.push('access')
      test.app.unknownType(action, meta)
      return true
    },
    process() {
      calls.push('process')
    }
  })
  let client = await connectClient(test.app)
  await sendTo(client, [
    'sync',
    1,
    { type: 'UNKOWN' },
    { id: [1, '10:uuid', 0], time: 1 }
  ])

  expect(test.names).toEqual(['connect', 'authenticated', 'unknownType', 'add'])
  expect(calls).toEqual(['access'])
})

it('allows to use different node ID', async () => {
  let app = createServer()
  let calls = 0
  app.type('A', {
    access(ctx, action, meta) {
      expect(ctx.nodeId).toEqual('10:client:other')
      expect(meta.id).toEqual('1 10:client:other 0')
      calls += 1
      return true
    }
  })
  let client = await connectClient(app, '10:client:uuid')
  await sendTo(client, [
    'sync',
    1,
    { type: 'A' },
    { id: [1, '10:client:other', 0], time: 1 }
  ])

  expect(calls).toEqual(1)
  expect(app.log.entries()[1][0].type).toEqual('logux/processed')
  expect(app.log.entries()[1][1].clients).toEqual(['10:client'])
})

it('allows to use different node ID only with same client ID', async () => {
  let test = createReporter()
  let client = await connectClient(test.app, '10:client:uuid')
  await sendTo(client, [
    'sync',
    1,
    { type: 'A' },
    { id: [1, '10:clnt:uuid', 0], time: 1 }
  ])

  expect(test.names).toEqual(['connect', 'authenticated', 'denied', 'add'])
})

it('has finally callback', async () => {
  let app = createServer()
  let calls: string[] = []
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })
  app.type(
    'A',
    {
      access: () => true,
      finally() {
        calls.push('A')
      }
    },
    { queue: 'A' }
  )
  app.type(
    'B',
    {
      access: () => true,
      finally() {
        calls.push('B')
      },
      process: () => {}
    },
    { queue: 'B' }
  )
  app.type(
    'C',
    {
      access: () => true,
      finally() {
        calls.push('C')
      },
      resend() {
        throw new Error('C')
      }
    },
    { queue: 'C' }
  )
  app.type(
    'D',
    {
      access() {
        throw new Error('D')
      },
      finally() {
        calls.push('D')
      }
    },
    { queue: 'D' }
  )
  app.type(
    'E',
    {
      access: () => true,
      finally() {
        calls.push('E')
        throw new Error('EE')
      },
      process() {
        throw new Error('E')
      }
    },
    { queue: 'E' }
  )
  let client = await connectClient(app, '10:client:uuid')
  await sendTo(client, [
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

  expect(calls).toEqual(['D', 'C', 'A', 'E', 'B'])
  expect(errors).toEqual(['D', 'C', 'E', 'EE'])
})

it('sends error to author', async () => {
  let app = createServer()
  app.type('A', { access: () => true })
  let client1 = await connectClient(app, '10:1:uuid')
  let client2 = await connectClient(app, '10:2:uuid')

  await sendTo(client2, [
    'sync',
    1,
    { type: 'A' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(1)

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
    resend: () => ({ channels: ['all'] })
  })
  app.channel('all', { access: () => true })

  let client1 = await connectClient(app, '10:1:uuid')
  let client2 = await connectClient(app, '10:2:uuid')

  await sendTo(client1, [
    'sync',
    1,
    { channel: 'all', type: 'logux/subscribe' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await sendTo(client2, [
    'sync',
    1,
    { channel: 'all', type: 'logux/subscribe' },
    { id: [1, '10:2:uuid', 0], time: 1 }
  ])

  await sendTo(client1, [
    'sync',
    4,
    { type: 'A' },
    { id: [2, '10:1:uuid', 0], time: 2 },
    { type: 'B' },
    { id: [3, '10:1:uuid', 0], time: 3 }
  ])
  await setTimeout(10)

  expect(actions(client1)).toEqual([])
  expect(actions(client2)).toEqual([{ type: 'A' }, { type: 'B' }])
})

it('keeps context', async () => {
  let app = createServer()
  app.type<Action, { a: number }>('A', {
    access(ctx) {
      ctx.data.a = 1
      return true
    },
    finally(ctx) {
      expect(ctx.data.a).toEqual(1)
    },
    process(ctx) {
      expect(ctx.data.a).toEqual(1)
    }
  })

  let client = await connectClient(app, '10:1:uuid')
  await sendTo(client, [
    'sync',
    1,
    { type: 'A' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(1)

  expect(sent(client)[2][2].type).toEqual('logux/processed')
})

it('uses resend for own actions', async () => {
  let app = createServer()
  app.type('FOO', {
    access: () => false,
    resend: () => ({ channel: 'foo' })
  })
  app.channel('foo', {
    access: () => true
  })
  let client = await connectClient(app, '10:1:uuid')
  await sendTo(client, [
    'sync',
    1,
    { channel: 'foo', type: 'logux/subscribe' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(10)

  app.log.add({ type: 'FOO' })
  await setTimeout(10)
  expect(app.log.entries()[2][1].channels).toEqual(['foo'])
  expect(sent(client)[3][2]).toEqual({ type: 'FOO' })

  app.log.add({ type: 'FOO' }, { status: 'processed' })
  await setTimeout(10)
  expect(app.log.entries()[3][1].channels).not.toBeDefined()
})

it('does not duplicate channel load actions', async () => {
  let app = createServer()
  app.type('FOO', {
    access: () => true,
    resend: () => ({ channel: 'foo' })
  })
  app.channel('foo', {
    access: () => true,
    async load(ctx) {
      await ctx.sendBack({ type: 'FOO' })
    }
  })
  let client = await connectClient(app, '10:1:uuid')
  await sendTo(client, [
    'sync',
    1,
    { channel: 'foo', type: 'logux/subscribe' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(10)

  function meta(time: number): object {
    return { id: time, subprotocol: '0.0.1', time }
  }

  expect(sent(client).slice(1)).toEqual([
    ['synced', 1],
    ['sync', 2, { type: 'FOO' }, meta(1)],
    ['sync', 3, { id: '1 10:1:uuid 0', type: 'logux/processed' }, meta(2)]
  ])
})

it('allows to return actions', async () => {
  let app = createServer()
  app.channel('a', {
    access: () => true,
    load() {
      return { type: 'A' }
    }
  })
  app.channel('b', {
    access: () => true,
    load() {
      return [{ type: 'B' }]
    }
  })
  app.channel('c', {
    access: () => true,
    load() {
      return [[{ type: 'C' }, { time: 100 }]]
    }
  })
  let client = await connectClient(app, '10:1:uuid')
  await sendTo(client, [
    'sync',
    1,
    { channel: 'a', type: 'logux/subscribe' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await sendTo(client, [
    'sync',
    2,
    { channel: 'b', type: 'logux/subscribe' },
    { id: [2, '10:1:uuid', 0], time: 2 }
  ])
  await sendTo(client, [
    'sync',
    3,
    { channel: 'c', type: 'logux/subscribe' },
    { id: [3, '10:1:uuid', 0], time: 3 }
  ])
  await setTimeout(50)

  function meta(time: number): object {
    return { id: time, subprotocol: '0.0.1', time }
  }

  expect(sent(client).slice(1)).toEqual([
    ['synced', 1],
    ['sync', 2, { type: 'A' }, meta(1)],
    ['sync', 3, { id: '1 10:1:uuid 0', type: 'logux/processed' }, meta(2)],
    ['synced', 2],
    ['sync', 5, { type: 'B' }, meta(3)],
    ['sync', 6, { id: '2 10:1:uuid 0', type: 'logux/processed' }, meta(4)],
    ['synced', 3],
    ['sync', 8, { type: 'C' }, { ...meta(5), time: 100 }],
    ['sync', 9, { id: '3 10:1:uuid 0', type: 'logux/processed' }, meta(6)]
  ])
})

it('does not process send-back actions', async () => {
  let app = createServer()
  app.channel('a', {
    access: () => true,
    load() {
      return { data: 'load', type: 'A' }
    }
  })

  let processed: string[] = []
  let resended: string[] = []
  app.type('A', {
    access: () => true,
    process(ctx, action) {
      processed.push(action.data)
    },
    resend(ctx, action) {
      resended.push(action.data)
      return {}
    }
  })

  app.log.add({ data: 'server', type: 'A' })
  let client = await connectClient(app, '10:1:uuid')
  await sendTo(client, [
    'sync',
    1,
    { data: 'client', type: 'A' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await sendTo(client, [
    'sync',
    2,
    { channel: 'a', type: 'logux/subscribe' },
    { id: [2, '10:1:uuid', 0], time: 2 }
  ])
  await setTimeout(10)

  expect(resended).toEqual(['server', 'client'])
  expect(processed).toEqual(['server', 'client'])
})

it('restores actions with old ID from history', async () => {
  let app = createServer()
  app.on('preadd', (action, meta) => {
    meta.reasons = []
  })
  let history: [Action, ServerMeta][] = []
  app.channel('a', {
    access: () => true,
    load() {
      return history
    }
  })
  app.type('A', {
    access: () => true,
    process(ctx, action, meta) {
      history.push([action, meta])
    }
  })

  let client1 = await connectClient(app, '10:1:uuid')
  await sendTo(client1, [
    'sync',
    1,
    { type: 'A' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])

  let client2 = await connectClient(app, '10:1:other')
  await sendTo(client2, [
    'sync',
    2,
    { channel: 'a', type: 'logux/subscribe' },
    { id: [2, '10:1:uuid', 0], time: 2 }
  ])
  await setTimeout(10)
  expect(actions(client2)).toEqual([{ type: 'A' }])
})

it('has shortcut to access and process in one callback', async () => {
  let app = createServer()
  app.log.keepActions()

  app.type('FOO', {
    async accessAndProcess(ctx, action, meta) {
      expect(typeof meta.id).toEqual('string')
      expect(action.type).toEqual('FOO')
      await ctx.sendBack({ type: 'REFOO' })
    }
  })
  app.otherType({
    async accessAndProcess(ctx, action, meta) {
      expect(typeof meta.id).toEqual('string')
      expect(typeof action.type).toEqual('string')
      if (action.type === 'BAR') {
        await ctx.sendBack({ type: 'REBAR' })
      }
    }
  })
  app.channel('foo', {
    async accessAndLoad(ctx, action, meta) {
      expect(typeof meta.id).toEqual('string')
      expect(action.type).toEqual('logux/subscribe')
      return { type: 'FOO:load' }
    }
  })
  app.otherChannel({
    accessAndLoad(ctx, action, meta) {
      expect(typeof meta.id).toEqual('string')
      expect(action.type).toEqual('logux/subscribe')
      return [{ type: 'OTHER:load' }]
    }
  })

  let client = await connectClient(app, '10:1:uuid')
  await sendTo(client, [
    'sync',
    1,
    { type: 'FOO' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  await sendTo(client, [
    'sync',
    2,
    { type: 'BAR' },
    { id: [2, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  await sendTo(client, [
    'sync',
    3,
    { channel: 'foo', type: 'logux/subscribe' },
    { id: [3, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  await sendTo(client, [
    'sync',
    4,
    { channel: 'bar', type: 'logux/subscribe' },
    { id: [4, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)

  expect(app.log.actions()).toEqual([
    { type: 'FOO' },
    { type: 'BAR' },
    { channel: 'foo', type: 'logux/subscribe' },
    { channel: 'bar', type: 'logux/subscribe' },
    { type: 'REFOO' },
    { id: '1 10:1:uuid 0', type: 'logux/processed' },
    { type: 'REBAR' },
    { id: '2 10:1:uuid 0', type: 'logux/processed' },
    { type: 'FOO:load' },
    { id: '3 10:1:uuid 0', type: 'logux/processed' },
    { type: 'OTHER:load' },
    { id: '4 10:1:uuid 0', type: 'logux/processed' }
  ])
})

it('process action exactly once with accessAndProcess callback', async () => {
  let app = createServer()
  app.log.keepActions()

  app.type('FOO', {
    async accessAndProcess(ctx) {
      await ctx.sendBack({ type: 'REFOO' })
    }
  })
  app.otherType({
    async accessAndProcess(ctx, action) {
      if (action.type === 'BAR') {
        await ctx.sendBack({ type: 'REBAR' })
      }
    }
  })

  let client = await connectClient(app, '10:1:uuid')
  await sendTo(client, [
    'sync',
    1,
    { type: 'FOO' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  await sendTo(client, [
    'sync',
    2,
    { type: 'BAR' },
    { id: [2, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)

  expect(app.log.actions()).toEqual([
    { type: 'FOO' },
    { type: 'BAR' },
    { type: 'REFOO' },
    { id: '1 10:1:uuid 0', type: 'logux/processed' },
    { type: 'REBAR' },
    { id: '2 10:1:uuid 0', type: 'logux/processed' }
  ])
})

it('denies access on 403 error', async () => {
  let app = createServer()
  app.log.keepActions()

  let error404 = new ResponseError(404, '/a', {}, '404')
  let error403 = new ResponseError(403, '/a', {}, '403')
  let error = new Error('test')

  let catched: Error[] = []
  app.on('error', e => {
    catched.push(e)
  })

  app.type('E404', {
    accessAndProcess() {
      throw error404
    }
  })
  app.type('E403', {
    accessAndProcess() {
      throw error403
    }
  })
  app.type('ERROR', {
    async accessAndProcess() {
      throw error
    }
  })

  let client = await connectClient(app, '10:1:uuid')
  await sendTo(client, [
    'sync',
    2,
    { type: 'E404' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  await sendTo(client, [
    'sync',
    2,
    { type: 'E403' },
    { id: [2, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  await sendTo(client, [
    'sync',
    2,
    { type: 'ERROR' },
    { id: [3, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  expect(app.log.actions()).toEqual([
    {
      action: { type: 'E404' },
      id: '1 10:1:uuid 0',
      reason: 'error',
      type: 'logux/undo'
    },
    {
      action: { type: 'E403' },
      id: '2 10:1:uuid 0',
      reason: 'denied',
      type: 'logux/undo'
    },
    {
      action: { type: 'ERROR' },
      id: '3 10:1:uuid 0',
      reason: 'error',
      type: 'logux/undo'
    }
  ])
  expect(catched).toEqual([error404, error])
})

it('undoes action with notFound on 404 error', async () => {
  let app = createServer()
  app.log.keepActions()

  let error500 = new ResponseError(500, '/a', {}, '500')
  let error404 = new ResponseError(404, '/a', {}, '404')
  let error403 = new ResponseError(403, '/a', {}, '403')
  let error = new Error('test')

  let catched: Error[] = []
  app.on('error', e => {
    catched.push(e)
  })

  app.channel('e500', {
    accessAndLoad() {
      throw error500
    }
  })
  app.channel('e404', {
    accessAndLoad() {
      throw error404
    }
  })
  app.channel('e403', {
    accessAndLoad() {
      throw error403
    }
  })
  app.channel('error', {
    accessAndLoad() {
      throw error
    }
  })

  let client = await connectClient(app, '10:1:uuid')
  await sendTo(client, [
    'sync',
    2,
    { channel: 'e500', type: 'logux/subscribe' },
    { id: [1, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  await sendTo(client, [
    'sync',
    2,
    { channel: 'e404', type: 'logux/subscribe' },
    { id: [2, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  await sendTo(client, [
    'sync',
    2,
    { channel: 'e403', type: 'logux/subscribe' },
    { id: [3, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  await sendTo(client, [
    'sync',
    2,
    { channel: 'error', type: 'logux/subscribe' },
    { id: [4, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  expect(app.log.actions()).toEqual([
    { channel: 'e500', type: 'logux/subscribe' },
    { channel: 'e404', type: 'logux/subscribe' },
    { channel: 'e403', type: 'logux/subscribe' },
    { channel: 'error', type: 'logux/subscribe' },
    {
      action: { channel: 'e500', type: 'logux/subscribe' },
      id: '1 10:1:uuid 0',
      reason: 'error',
      type: 'logux/undo'
    },
    {
      action: { channel: 'e404', type: 'logux/subscribe' },
      id: '2 10:1:uuid 0',
      reason: 'notFound',
      type: 'logux/undo'
    },
    {
      action: { channel: 'e403', type: 'logux/subscribe' },
      id: '3 10:1:uuid 0',
      reason: 'denied',
      type: 'logux/undo'
    },
    {
      action: { channel: 'error', type: 'logux/subscribe' },
      id: '4 10:1:uuid 0',
      reason: 'error',
      type: 'logux/undo'
    }
  ])
  expect(catched).toEqual([error500, error])
})

it('allows to throws LoguxNotFoundError', async () => {
  let app = createServer()
  app.log.keepActions()

  let catched: Error[] = []
  app.on('error', e => {
    catched.push(e)
  })

  app.channel('notFound', {
    accessAndLoad() {
      throw new LoguxNotFoundError()
    }
  })

  let client = await connectClient(app, '10:1:uuid')
  await sendTo(client, [
    'sync',
    2,
    { channel: 'notFound', type: 'logux/subscribe' },
    { id: [2, '10:1:uuid', 0], time: 1 }
  ])
  await setTimeout(100)
  expect(app.log.actions()).toEqual([
    { channel: 'notFound', type: 'logux/subscribe' },
    {
      action: { channel: 'notFound', type: 'logux/subscribe' },
      id: '2 10:1:uuid 0',
      reason: 'notFound',
      type: 'logux/undo'
    }
  ])
})

it('undoes all other actions in a queue if error in one action occurs', async () => {
  let app = createServer()
  let calls: string[] = []
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })
  app.type(
    'GOOD 0',
    {
      access: () => true,
      process() {
        calls.push('GOOD 0')
      }
    },
    { queue: '1' }
  )
  app.type(
    'BAD',
    {
      access: () => true,
      async process() {
        await setTimeout(50)
        calls.push('BAD')
        throw new Error('BAD')
      }
    },
    { queue: '1' }
  )
  app.type(
    'GOOD 1',
    {
      access: () => true,
      process() {
        calls.push('GOOD 1')
      }
    },
    { queue: '1' }
  )
  app.type(
    'GOOD 2',
    {
      access: () => true,
      process() {
        calls.push('GOOD 2')
      }
    },
    { queue: '1' }
  )

  let client = await connectClient(app, '10:client:uuid')
  await sendTo(client, [
    'sync',
    3,
    { type: 'GOOD 0' },
    { id: [1, '10:client:other', 0], time: 1 },
    { type: 'BAD' },
    { id: [2, '10:client:other', 0], time: 1 },
    { type: 'GOOD 1' },
    { id: [3, '10:client:other', 0], time: 1 },
    { type: 'GOOD 2' },
    { id: [4, '10:client:other', 0], time: 1 }
  ])
  await setTimeout(50)

  expect(errors).toEqual(['BAD'])
  expect(calls).toEqual(['GOOD 0', 'BAD'])
})

it('does not add action with same ID to the queue', async () => {
  let app = createServer()
  let errors: string[] = []
  let calls: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })
  app.type(
    'FOO',
    {
      access: () => true,
      process: () => {
        calls.push('FOO')
      }
    },
    { queue: '1' }
  )
  app.type(
    'BAR',
    {
      access: () => true,
      process: () => {
        calls.push('BAR')
      }
    },
    { queue: '1' }
  )
  app.type(
    'BAZ',
    {
      access: () => true,
      process: () => {
        calls.push('BAZ')
      }
    },
    { queue: '2' }
  )
  app.type(
    'BOM',
    {
      access: () => true,
      process: () => {
        calls.push('BOM')
      }
    },
    { queue: '2' }
  )

  let client = await connectClient(app, '10:client:uuid')
  await sendTo(client, [
    'sync',
    4,
    { type: 'FOO' },
    { id: [1, '10:client:other', 0], time: 1 },
    { type: 'BAR' },
    { id: [1, '10:client:other', 0], time: 1 },
    { type: 'BAZ' },
    { id: [1, '10:client:other', 0], time: 1 },
    { type: 'BOM' },
    { id: [2, '10:client:other', 0], time: 1 }
  ])

  expect(errors).toEqual([])
  expect(calls).toEqual(['FOO', 'BOM'])
})

it('does not undo actions in one queue if error occurs in another queue', async () => {
  let app = createServer()
  let calls: string[] = []
  let errors: string[] = []
  app.on('error', e => {
    errors.push(e.message)
  })
  app.type(
    'BAD',
    {
      access: () => true,
      process() {
        calls.push('BAD')
        throw new Error('BAD')
      }
    },
    { queue: '1' }
  )
  app.type(
    'GOOD 1',
    {
      access: () => true,
      async process() {
        await setTimeout(30)
        calls.push('GOOD 1')
      }
    },
    { queue: '2' }
  )
  app.type(
    'GOOD 2',
    {
      access: () => true,
      process() {
        calls.push('GOOD 2')
      }
    },
    { queue: '2' }
  )

  let client = await connectClient(app, '10:client:uuid')
  await sendTo(client, [
    'sync',
    3,
    { type: 'BAD' },
    { id: [1, '10:client:other', 0], time: 1 },
    { type: 'GOOD 1' },
    { id: [2, '10:client:other', 0], time: 1 },
    { type: 'GOOD 2' },
    { id: [3, '10:client:other', 0], time: 1 }
  ])
  await setTimeout(50)

  expect(errors).toEqual(['BAD'])
  expect(calls).toEqual(['BAD', 'GOOD 1', 'GOOD 2'])
})

it('calls access, resend and process in a queue', async () => {
  let app = createServer()
  let calls: string[] = []
  app.type('FOO', {
    async access() {
      await setTimeout(50)
      calls.push('FOO ACCESS')
      return true
    },
    async process() {
      await setTimeout(50)
      calls.push('FOO PROCESS')
    },
    async resend() {
      await setTimeout(50)
      calls.push('FOO RESEND')
      return ''
    }
  })
  app.type('BAR', {
    async access() {
      calls.push('BAR ACCESS')
      return true
    },
    async process() {
      calls.push('BAR PROCESS')
    },
    async resend() {
      calls.push('BAR RESEND')
      return ''
    }
  })

  let client = await connectClient(app, '10:client:uuid')
  await sendTo(client, [
    'sync',
    2,
    { type: 'FOO' },
    { id: [1, '10:client:other', 0], time: 1 },
    { type: 'BAR' },
    { id: [2, '10:client:other', 0], time: 1 }
  ])
  await setTimeout(200)

  expect(calls).toEqual([
    'FOO ACCESS',
    'FOO RESEND',
    'FOO PROCESS',
    'BAR ACCESS',
    'BAR RESEND',
    'BAR PROCESS'
  ])
})

it('undoes all other actions in a queue if some action should be undone', async () => {
  let test = createReporter()
  test.app.type('FOO', {
    access: () => false
  })
  test.app.type('BAR', {
    access: () => true
  })

  let client = await connectClient(test.app)
  await sendTo(client, [
    'sync',
    3,
    { type: 'FOO' },
    { id: [1, '10:uuid', 0], time: 1 },
    { type: 'BAR' },
    { id: [2, '10:uuid', 0], time: 1 }
  ])

  expect(test.names).toEqual([
    'connect',
    'authenticated',
    'denied',
    'add',
    'add'
  ])
  expect(test.app.log.actions()).toEqual([
    {
      action: { type: 'FOO' },
      id: '1 10:uuid 0',
      reason: 'denied',
      type: 'logux/undo'
    },
    {
      action: { type: 'BAR' },
      id: '2 10:uuid 0',
      reason: 'error',
      type: 'logux/undo'
    }
  ])
})

it('all actions are processed before destroy', async () => {
  let app = createServer()
  let calls: string[] = []
  app.type(
    'queue 1 task 1',
    {
      async access() {
        return true
      },
      async process() {
        await setTimeout(30)
        calls.push('queue 1 task 1')
      }
    },
    { queue: '1' }
  )
  app.type(
    'queue 1 task 2',
    {
      async access() {
        return true
      },
      async process() {
        await setTimeout(30)
        calls.push('queue 1 task 2')
      }
    },
    { queue: '1' }
  )
  app.type(
    'queue 2 task 1',
    {
      async access() {
        await setTimeout(50)
        return true
      },
      async process() {
        calls.push('queue 2 task 1')
      }
    },
    { queue: '2' }
  )
  app.type(
    'queue 2 task 2',
    {
      async access() {
        return true
      },
      async process() {
        calls.push('queue 2 task 2')
      }
    },
    { queue: '2' }
  )
  app.type('during destroy', {
    async access() {
      return true
    },
    async process() {
      calls.push('during destroy')
    }
  })

  let client = await connectClient(app, '10:client:uuid')
  sendTo(client, [
    'sync',
    4,
    { type: 'queue 1 task 1' },
    { id: [1, client.nodeId!, 0], time: 1 },
    { type: 'queue 1 task 2' },
    { id: [2, client.nodeId!, 0], time: 1 },
    { type: 'queue 2 task 1' },
    { id: [3, client.nodeId!, 0], time: 1 },
    { type: 'queue 2 task 2' },
    { id: [4, client.nodeId!, 0], time: 1 }
  ])
  await setTimeout(10)
  await app.destroy()

  expect(calls).toEqual([
    'queue 1 task 1',
    'queue 2 task 1',
    'queue 2 task 2',
    'queue 1 task 2'
  ])
})

it('recognizes channel regex', async () => {
  let app = createServer()
  let calls: string[] = []
  app.channel(/ba./, {
    access: () => true,
    load: (_, action) => {
      calls.push(action.channel)
    }
  })

  let client = await connectClient(app, '10:client:uuid')
  await sendTo(client, [
    'sync',
    3,
    { channel: 'bar', type: 'logux/subscribe' },
    { id: [1, client.nodeId || '', 0], time: 1 },
    { channel: 'baz', type: 'logux/subscribe' },
    { id: [2, client.nodeId || '', 0], time: 1 },
    { channel: 'bom', type: 'logux/subscribe' },
    { id: [3, client.nodeId || '', 0], time: 1 }
  ])

  expect(calls).toEqual(['bar', 'baz'])
})

it('recognizes channel pattern', async () => {
  let app = createServer()
  let calls: string[] = []
  app.channel('/api/users/:id', {
    access: () => true,
    load: (_, action) => {
      calls.push(action.channel)
    }
  })

  let client = await connectClient(app, '10:client:uuid')
  await sendTo(client, [
    'sync',
    3,
    { channel: '/api/users/5', type: 'logux/subscribe' },
    { id: [1, client.nodeId || '', 0], time: 1 },
    { channel: '/api/users/10', type: 'logux/subscribe' },
    { id: [2, client.nodeId || '', 0], time: 1 },
    { channel: '/api/users/10/9/8', type: 'logux/subscribe' },
    { id: [3, client.nodeId || '', 0], time: 1 }
  ])

  expect(calls).toEqual(['/api/users/5', '/api/users/10'])
})

it('removes empty queues', async () => {
  let app = createServer()
  app.type('FOO', {
    access: () => true,
    process: async () => {
      await setTimeout(50)
    }
  })
  app.type('BAR', {
    access: () => true
  })

  let client = await connectClient(app, '10:client:uuid')
  sendTo(client, [
    'sync',
    2,
    { type: 'FOO' },
    { id: [1, '10:client:uuid', 0], time: 1 },
    { type: 'BAR' },
    { id: [2, '10:client:uuid', 0], time: 1 }
  ])

  await setTimeout(10)
  expect(privateMethods(app).queues.size).toEqual(1)
  await setTimeout(50)
  expect(privateMethods(app).queues.size).toEqual(0)
})
