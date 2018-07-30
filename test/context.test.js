let Context = require('../context')

it('has open data', () => {
  let ctx = new Context('10:uuid', '10', '2.4.0')
  expect(ctx.data).toEqual({ })
})

it('saves data', () => {
  let ctx = new Context('10:uuid', '10', '2.4.0')
  expect(ctx.nodeId).toEqual('10:uuid')
  expect(ctx.userId).toEqual('10')
  expect(ctx.subprotocol).toEqual('2.4.0')
})

it('detects servers', () => {
  let user = new Context('10:uuid', '10', '2.4.0')
  expect(user.isServer).toBeFalsy()
  let server = new Context('server:uuid', '10', '2.4.0')
  expect(server.isServer).toBeTruthy()
})

it('checks subprotocol', () => {
  let ctx = new Context('10:uuid', '10', '2.4.0')
  expect(ctx.isSubprotocol('^2.0')).toBeTruthy()
  expect(ctx.isSubprotocol('>2.5')).toBeFalsy()
})
