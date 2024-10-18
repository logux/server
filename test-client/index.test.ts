import type { LoguxSubscribeAction } from '@logux/actions'
import { TestTime } from '@logux/core'
import { restoreAll, type Spy, spyOn } from 'nanospy'
import { setTimeout } from 'node:timers/promises'
import { afterEach, expect, it } from 'vitest'

import { type LoguxActionError, TestClient, TestServer } from '../index.js'

let server: TestServer
afterEach(() => {
  restoreAll()
  server.destroy()
})

async function catchError(cb: () => Promise<any>): Promise<LoguxActionError> {
  let err: LoguxActionError | undefined
  try {
    await cb()
  } catch (e) {
    err = e as LoguxActionError
  }
  if (!err) throw new Error('Error was no thrown')
  return err
}

function privateMethods(obj: object): any {
  return obj
}

it('connects and disconnect', async () => {
  server = new TestServer()
  let client1 = new TestClient(server, '10')
  let client2 = new TestClient(server, '10')
  expect(client1.nodeId).toEqual('10:1:1')
  expect(client1.clientId).toEqual('10:1')
  expect(client1.userId).toEqual('10')
  expect(client2.nodeId).toEqual('10:2:1')
  await Promise.all([client1.connect(), client2.connect()])
  expect(Array.from(server.clientIds.keys())).toEqual(['10:1', '10:2'])
  await client1.disconnect()
  expect(Array.from(server.clientIds.keys())).toEqual(['10:2'])
})

it('sends and collect actions', async () => {
  server = new TestServer()
  server.type('FOO', {
    access: () => true,
    process(ctx) {
      ctx.sendBack({ type: 'BAR' })
    }
  })
  server.type('RESEND', {
    access: () => true,
    resend: () => ({ user: '10' })
  })
  let [client1, client2] = await Promise.all([
    server.connect('10'),
    server.connect('11')
  ])
  client1.log.keepActions()
  let received = await client1.collect(async () => {
    await client1.log.add({ type: 'FOO' })
    await setTimeout(10)
    await client2.log.add({ type: 'RESEND' })
    await setTimeout(10)
  })
  expect(received).toEqual([
    { type: 'BAR' },
    { id: '1 10:1:1 0', type: 'logux/processed' },
    { type: 'RESEND' }
  ])
  expect(client1.log.actions()).toEqual([
    { type: 'FOO' },
    { type: 'BAR' },
    { id: '1 10:1:1 0', type: 'logux/processed' },
    { type: 'RESEND' }
  ])
})

it('allows to change time', () => {
  let time = new TestTime()
  let server1 = new TestServer({ time })
  let server2 = new TestServer({ time })
  expect(server1.options.time).toBe(time)
  expect(server2.options.time).toBe(time)
  expect(server1.nodeId).not.toEqual(server2.nodeId)
})

it('tracks action processing', async () => {
  server = new TestServer()
  server.type('FOO', {
    access: () => true
  })
  server.type('ERR', {
    access: () => true,
    process() {
      throw new Error('test')
    }
  })
  server.type('DENIED', {
    access: () => false
  })
  server.type('UNDO', {
    access: () => true,
    process(ctx, action, meta) {
      server.undo(action, meta)
    }
  })
  let client = await server.connect('10')

  let processed = await client.process({ type: 'FOO' })
  expect(processed).toEqual([{ id: '1 10:1:1 0', type: 'logux/processed' }])

  let notDenied = await catchError(async () => {
    await server.expectDenied(() => client.process({ type: 'FOO' }))
  })
  expect(notDenied.message).toEqual('Actions passed without error')

  let serverError = await catchError(() => client.process({ type: 'ERR' }))
  expect(serverError.message).toEqual('test')
  expect(serverError.action).toEqual({
    action: { type: 'ERR' },
    id: '5 10:1:1 0',
    reason: 'error',
    type: 'logux/undo'
  })

  let accessError = await catchError(() => client.process({ type: 'DENIED' }))
  expect(accessError.message).toEqual('Action was denied')

  await server.expectDenied(() => client.process({ type: 'DENIED' }))

  let unknownError = await catchError(() => client.process({ type: 'UNKNOWN' }))
  expect(unknownError.message).toEqual(
    'Server does not have callbacks for UNKNOWN actions'
  )

  let customError1 = await catchError(() => client.process({ type: 'UNDO' }))
  expect(customError1.message).toEqual('Server undid action')

  let customError2 = await catchError(async () => {
    await server.expectDenied(() => client.process({ type: 'UNDO' }))
  })
  expect(customError2.message).toEqual('Undo was with error reason, not denied')

  await server.expectUndo('error', () => client.process({ type: 'UNDO' }))

  let reasonError = await catchError(async () => {
    await server.expectUndo('another', () => client.process({ type: 'UNDO' }))
  })
  expect(reasonError.message).toEqual('Undo was with error reason, not another')

  let noReasonError = await catchError(async () => {
    await server.expectUndo('error', () => client.process({ type: 'UNKNOWN' }))
  })
  expect(noReasonError.message).toEqual(
    'Server does not have callbacks for UNKNOWN actions'
  )

  await server.expectError('test', async () => {
    await client.process({ type: 'ERR' })
  })
  await server.expectError(/te/, async () => {
    await client.process({ type: 'ERR' })
  })
  let wrongMessageError = await catchError(async () => {
    await server.expectError('te', async () => {
      await client.process({ type: 'ERR' })
    })
  })
  expect(wrongMessageError.message).toEqual('test')
  let noErrorError = await catchError(async () => {
    await server.expectError('te', async () => {
      await client.process({ type: 'FOO' })
    })
  })
  expect(noErrorError.message).toEqual('Actions passed without error')
})

it('detects action ID duplicate', async () => {
  server = new TestServer()
  server.type('FOO', {
    access: () => true
  })
  let client = await server.connect('10')
  client.log.keepActions()

  let processed = await client.process({ type: 'FOO' }, { id: '1 10:1:1 0' })
  expect(processed).toEqual([{ id: '1 10:1:1 0', type: 'logux/processed' }])

  let err = await catchError(async () => {
    await client.process({ type: 'FOO' }, { id: '1 10:1:1 0' })
  })
  expect(err.message).toEqual('Action 1 10:1:1 0 was already in log')
})

it('tracks subscriptions', async () => {
  server = new TestServer()
  server.channel<object, object, LoguxSubscribeAction>('foo', {
    access: () => true,
    load(ctx, action) {
      ctx.sendBack({ a: action.filter?.a, since: action.since, type: 'FOO' })
    }
  })
  let client = await server.connect('10')
  let actions1 = await client.subscribe('foo')
  expect(actions1).toEqual([{ a: undefined, type: 'FOO' }])

  await client.unsubscribe('foo')
  expect(privateMethods(server).subscribers).toEqual({})

  let actions2 = await client.subscribe('foo', { a: 1 })
  expect(actions2).toEqual([{ a: 1, type: 'FOO' }])

  let actions3 = await client.subscribe('foo', undefined, {
    id: '1 1:0:0',
    time: 1
  })
  expect(actions3).toEqual([{ since: { id: '1 1:0:0', time: 1 }, type: 'FOO' }])

  await client.unsubscribe('foo', { a: 1 })
  expect(privateMethods(server).subscribers).toEqual({
    foo: {
      '10:1:1': {
        filters: {
          '{}': true
        }
      }
    }
  })

  await client.unsubscribe('foo')
  expect(privateMethods(server).subscribers).toEqual({})

  let actions4 = await client.subscribe({
    channel: 'foo',
    filter: { a: 2 },
    type: 'logux/subscribe'
  })
  expect(actions4).toEqual([{ a: 2, type: 'FOO' }])

  let unknownError = await catchError(() => client.subscribe('unknown'))
  expect(unknownError.message).toEqual(
    'Server does not have callbacks for unknown channel'
  )
})

it('prints server log', async () => {
  let reporterStream = {
    write() {}
  }
  spyOn(reporterStream, 'write', () => {})
  server = new TestServer({
    logger: { stream: reporterStream }
  })
  await server.connect('10:uuid')
  expect((reporterStream.write as any as Spy).callCount).toEqual(2)
})

it('tests authentication', async () => {
  server = new TestServer()
  server.options.supports = '0.0.0'
  server.auth(({ token, userId }) => userId === '10' && token === 'good')

  let wrong = await catchError(async () => {
    await server.connect('10', { token: 'bad' })
  })
  expect(wrong.message).toEqual('Wrong credentials')

  await server.expectWrongCredentials('10', { token: 'bad' })

  let error1 = await catchError(async () => {
    await server.connect('10', { subprotocol: '1.0.0' })
  })
  expect(error1.message).toContain('wrong-subprotocol')

  let error2 = await catchError(async () => {
    await server.expectWrongCredentials('10', { subprotocol: '1.0.0' })
  })
  expect(error2.message).toContain('wrong-subprotocol')

  await server.connect('10', { token: 'good' })

  let notWrong = await catchError(async () => {
    await server.expectWrongCredentials('10', { token: 'good' })
  })
  expect(notWrong.message).toEqual('Credentials passed')
})

it('disables build-in auth', async () => {
  server = new TestServer({ auth: false })
  expect(privateMethods(server).authenticator).not.toBeDefined()
})

it('sets client headers', async () => {
  server = new TestServer()
  await server.connect('10', { headers: { locale: 'fr' } })
  let node = server.clientIds.get('10:1')?.node
  expect(node?.remoteHeaders).toEqual({ locale: 'fr' })
})

it('sets client cookie', async () => {
  server = new TestServer()
  server.auth(({ cookie }) => cookie.token === 'good')
  await server.connect('10', { cookie: { token: 'good' } })
  await server.expectWrongCredentials('10', { cookie: { token: 'bad' } })
})

it('sets custom HTTP headers', async () => {
  server = new TestServer()
  server.auth(({ client }) => client.httpHeaders.authorization === 'good')
  await server.connect('10', { httpHeaders: { authorization: 'good' } })
  await server.expectWrongCredentials('10', {
    httpHeaders: { authorization: 'bad' }
  })
  await server.expectWrongCredentials('10')
})

it('collects received actions', async () => {
  server = new TestServer()
  server.type('foo', {
    access: () => true,
    process(ctx) {
      ctx.sendBack({ type: 'bar' })
    }
  })
  let client = await server.connect('10')
  let actions = await client.received(async () => {
    await client.process({ type: 'foo' })
  })
  expect(actions).toEqual([
    { type: 'bar' },
    { id: '1 10:1:1 0', type: 'logux/processed' }
  ])
})

it('receives HTTP requests', async () => {
  server = new TestServer()
  server.http('GET', '/a', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(String(req.headers['x-test'] ?? 'empty'))
  })

  let response1 = await server.fetch('/a')
  expect(response1.headers.get('Content-Type')).toEqual('text/plain')
  expect(await response1.text()).toEqual('empty')

  let response2 = await server.fetch('/a', { headers: [['X-Test', '1']] })
  expect(await response2.text()).toEqual('1')

  let response3 = await server.fetch('/b')
  expect(response3.status).toEqual(404)

  let response4 = await server.fetch('/a', { method: 'POST' })
  expect(response4.status).toEqual(404)
})

it('does not block login because of bruteforce', async () => {
  server = new TestServer()
  server.auth(({ userId }) => {
    return userId === 'good'
  })
  await server.expectWrongCredentials('bad1')
  await server.expectWrongCredentials('bad2')
  await server.expectWrongCredentials('bad3')
  await server.expectWrongCredentials('bad4')
  await server.expectWrongCredentials('bad5')
  await server.connect('good')
})

it('destroys on fatal', () => {
  server = new TestServer()
  // @ts-expect-error
  server.emitter.emit('fatal')
  // @ts-expect-error
  expect(server.destroying).toBe(true)
})
