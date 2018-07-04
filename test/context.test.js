const Context = require('../context')

it('has open data', () => {
  const ctx = new Context('10:uuid', '10', '2.4.0')
  expect(ctx.data).toEqual({ })
})

it('saves data', () => {
  const ctx = new Context('10:uuid', '10', '2.4.0')
  expect(ctx.nodeId).toEqual('10:uuid')
  expect(ctx.userId).toEqual('10')
  expect(ctx.subprotocol).toEqual('2.4.0')
})

it('detects servers', () => {
  const user = new Context('10:uuid', '10', '2.4.0')
  expect(user.isServer).toBeFalsy()
  const server = new Context('server:uuid', '10', '2.4.0')
  expect(server.isServer).toBeTruthy()
})

it('checks subprotocol', () => {
  const ctx = new Context('10:uuid', '10', '2.4.0')
  expect(ctx.isSubprotocol('^2.0')).toBeTruthy()
  expect(ctx.isSubprotocol('>2.5')).toBeFalsy()
})
