let parseNodeId = require('../parse-node-id')
let Context = require('../context')

function createContext (nodeId, subprotocol, server) {
  let data = parseNodeId(nodeId)
  return new Context(nodeId, data.clientId, data.userId, subprotocol, server)
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

it('sends action back', () => {
  let entries = []
  let ctx = createContext('10:uuid', '2.4.0', {
    log: {
      add (action, meta) {
        entries.push([action, meta])
        return 1
      }
    }
  })
  expect(ctx.sendBack({ type: 'A' })).toEqual(1)
  ctx.sendBack({ type: 'B' }, { reasons: ['1'], clientIds: [] })
  expect(entries).toEqual([
    [{ type: 'A' }, { clientIds: ['10:uuid'] }],
    [{ type: 'B' }, { reasons: ['1'], clientIds: [] }]
  ])
})
