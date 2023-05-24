import { spyOn, restoreAll, Spy } from 'nanospy'
import { it, expect, afterEach } from 'vitest'
import { LoguxSubscribeAction } from '@logux/actions'
import { TestTime } from '@logux/core'
import { delay } from 'nanodelay'

import { TestClient, TestServer, LoguxActionError } from '../index.js'

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
    await delay(10)
    await client2.log.add({ type: 'RESEND' })
    await delay(10)
  })
  expect(received).toEqual([
    { type: 'BAR' },
    { type: 'logux/processed', id: '1 10:1:1 0' },
    { type: 'RESEND' }
  ])
  expect(client1.log.actions()).toEqual([
    { type: 'FOO' },
    { type: 'BAR' },
    { type: 'logux/processed', id: '1 10:1:1 0' },
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
  expect(processed).toEqual([{ type: 'logux/processed', id: '1 10:1:1 0' }])

  let notDenied = await catchError(async () => {
    await server.expectDenied(() => client.process({ type: 'FOO' }))
  })
  expect(notDenied.message).toEqual('Actions passed without error')

  let serverError = await catchError(() => client.process({ type: 'ERR' }))
  expect(serverError.message).toEqual('test')
  expect(serverError.action).toEqual({
    type: 'logux/undo',
    id: '5 10:1:1 0',
    reason: 'error',
    action: { type: 'ERR' }
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
  expect(processed).toEqual([{ type: 'logux/processed', id: '1 10:1:1 0' }])

  let err = await catchError(async () => {
    await client.process({ type: 'FOO' }, { id: '1 10:1:1 0' })
  })
  expect(err.message).toEqual('Action 1 10:1:1 0 was already in log')
})

it('tracks subscriptions', async () => {
  server = new TestServer()
  server.channel<{}, {}, LoguxSubscribeAction>('foo', {
    access: () => true,
    load(ctx, action) {
      ctx.sendBack({ type: 'FOO', a: action.filter?.a, since: action.since })
    }
  })
  let client = await server.connect('10')
  let actions1 = await client.subscribe('foo')
  expect(actions1).toEqual([{ type: 'FOO', a: undefined }])

  await client.unsubscribe('foo')
  expect(privateMethods(server).subscribers).toEqual({})

  let actions2 = await client.subscribe('foo', { a: 1 })
  expect(actions2).toEqual([{ type: 'FOO', a: 1 }])

  let actions3 = await client.subscribe('foo', undefined, {
    id: '1 1:0:0',
    time: 1
  })
  expect(actions3).toEqual([{ type: 'FOO', since: { id: '1 1:0:0', time: 1 } }])

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
    type: 'logux/subscribe',
    channel: 'foo',
    filter: { a: 2 }
  })
  expect(actions4).toEqual([{ type: 'FOO', a: 2 }])

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
  server.auth(({ userId, token }) => userId === '10' && token === 'good')

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
    { type: 'logux/processed', id: '1 10:1:1 0' }
  ])
})

it('destroys on fatal', () => {
  server = new TestServer()
  // @ts-expect-error
  server.emitter.emit('fatal')
  // @ts-expect-error
  expect(server.destroying).toBe(true)
})
