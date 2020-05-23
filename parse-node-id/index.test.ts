import { parseNodeId } from '..'

it('parses node ID', () => {
  expect(parseNodeId('10:client:uuid')).toEqual({
    nodeId: '10:client:uuid',
    clientId: '10:client',
    userId: '10'
  })
})

it('parses action ID', () => {
  expect(parseNodeId('1 10:client:uuid 0')).toEqual({
    nodeId: '10:client:uuid',
    clientId: '10:client',
    userId: '10'
  })
})

it('parses node ID without client', () => {
  expect(parseNodeId('10:uuid')).toEqual({
    nodeId: '10:uuid',
    clientId: '10:uuid',
    userId: '10'
  })
})

it('parses node ID without client and user', () => {
  expect(parseNodeId('uuid')).toEqual({
    nodeId: 'uuid',
    clientId: 'uuid',
    userId: undefined
  })
})

it('parses node ID with false user', () => {
  expect(parseNodeId('false:client:uuid')).toEqual({
    nodeId: 'false:client:uuid',
    clientId: 'false:client',
    userId: 'false'
  })
})

it('parses node ID with multiple colon', () => {
  expect(parseNodeId('10:client:uuid:more')).toEqual({
    nodeId: '10:client:uuid:more',
    clientId: '10:client',
    userId: '10'
  })
})
