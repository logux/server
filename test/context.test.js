let parseNodeId = require('../parse-node-id')
let Context = require('../context')

function createContext (nodeId, subprotocol) {
  let data = parseNodeId(nodeId)
  return new Context(nodeId, data.clientId, data.userId, subprotocol)
}

it('has open data', () => {
  let ctx = createContext('10:client:uuid', '2.4.0')
  expect(ctx.data).toEqual({ })
})

it('saves data', () => {
  let ctx = createContext('10:client:uuid', '2.4.0')
  expect(ctx.nodeId).toEqual('10:client:uuid')
  expect(ctx.clientId).toEqual('10:client')
  expect(ctx.userId).toEqual('10')
  expect(ctx.subprotocol).toEqual('2.4.0')
})

it('detects servers', () => {
  let user = createContext('10:uuid', '2.4.0')
  expect(user.isServer).toBeFalsy()
  let server = createContext('server:uuid', '2.4.0')
  expect(server.isServer).toBeTruthy()
})

it('checks subprotocol', () => {
  let ctx = createContext('10:uuid', '2.4.0')
  expect(ctx.isSubprotocol('^2.0')).toBeTruthy()
  expect(ctx.isSubprotocol('>2.5')).toBeFalsy()
})
