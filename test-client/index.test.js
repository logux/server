let { delay } = require('nanodelay')

let { TestClient, TestServer } = require('..')

let server
afterEach(() => {
  if (server) server.destroy()
})

async function catchError (cb) {
  let err
  try {
    await cb()
  } catch (e) {
    err = e
  }
  return err
}

it('connects and disconnect', async () => {
  server = new TestServer()
  let client1 = new TestClient(server, '10')
  let client2 = new TestClient(server, '10')
  await Promise.all([
    client1.connect(),
    client2.connect()
  ])
  expect(Object.keys(server.clientIds)).toEqual(['10:1', '10:2'])
  await client1.disconnect()
  expect(Object.keys(server.clientIds)).toEqual(['10:2'])
})

it('sends and collect actions', async () => {
  server = new TestServer()
  server.type('FOO', {
    access: () => true,
    process (ctx) {
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

it('tracks action processing', async () => {
  server = new TestServer()
  server.type('FOO', {
    access: () => true
  })
  server.type('ERR', {
    access: () => true,
    process () {
      throw new Error('test')
    }
  })
  server.type('DENIED', {
    access: () => false
  })
  server.type('UNDO', {
    access: () => true,
    process (ctx, action, meta) {
      server.undo(meta)
    }
  })
  let client = await server.connect('10')

  let processed = await client.process({ type: 'FOO' })
  expect(processed).toEqual([{ type: 'logux/processed', id: '1 10:1:1 0' }])

  let serverError = await catchError(() => client.process({ type: 'ERR' }))
  expect(serverError.message).toEqual('test')
  expect(serverError.action).toEqual({
    type: 'logux/undo', id: '3 10:1:1 0', reason: 'error'
  })

  let accessError = await catchError(() => client.process({ type: 'DENIED' }))
  expect(accessError.message).toEqual('Action was denied')

  let unknownError = await catchError(() => client.process({ type: 'UNKNOWN' }))
  expect(unknownError.message).toEqual(
    'Server does not have callbacks for UNKNOWN actions'
  )

  let customError = await catchError(() => client.process({ type: 'UNDO' }))
  expect(customError.message).toEqual('Server undid action')
})

it('detects action ID dublicate', async () => {
  server = new TestServer()
  server.type('FOO', {
    access: () => true
  })
  let client = await server.connect('10')

  let processed = await client.process({ type: 'FOO' }, { id: '1 10:1:1 0' })
  expect(processed).toEqual([{ type: 'logux/processed', id: '1 10:1:1 0' }])

  let err = await catchError(async () => {
    await client.process({ type: 'FOO' }, { id: '1 10:1:1 0' })
  })
  expect(err.message).toEqual('Action 1 10:1:1 0 was already in log')
})

it('tracks subscriptions', async () => {
  server = new TestServer()
  server.channel('foo', {
    access: () => true,
    load (ctx, action) {
      ctx.sendBack({ type: 'FOO', a: action.a })
    }
  })
  let client = await server.connect('10')
  let actions1 = await client.subscribe('foo')
  expect(actions1).toEqual([{ type: 'FOO', a: undefined }])

  await client.unsubscribe('foo')
  expect(server.subscribers).toEqual({ })

  let actions2 = await client.subscribe({
    type: 'logux/subscribe', channel: 'foo', a: 1
  })
  expect(actions2).toEqual([{ type: 'FOO', a: 1 }])

  let unknownError = await catchError(() => client.subscribe('unknown'))
  expect(unknownError.message).toEqual(
    'Server does not have callbacks for unknown channel'
  )
})

it('prints server log', async () => {
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  server = new TestServer({ reporter: 'human' })
  await server.connect()
  expect(process.stdout.write).toHaveBeenCalledTimes(2)
})

it('tests authentication', async () => {
  server = new TestServer()
  server.auth((userId, token) => userId === '10' && token === 'good')
  let client = new TestClient(server, '10')
  // let error = await catchError(() => client.connect({ token: 'bad' }))
  // expect(error.message).toEqual('Wrong credentials')
  await client.connect({ token: 'good' })
})
