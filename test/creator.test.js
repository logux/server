'use strict'

const Creator = require('../creator')

it('saves date', () => {
  const creator = new Creator('10:uuid', '10', '2.4.0')
  expect(creator.nodeId).toEqual('10:uuid')
  expect(creator.user).toEqual('10')
  expect(creator.subprotocol).toEqual('2.4.0')
})

it('detects servers', () => {
  const user = new Creator('10:uuid', '10', '2.4.0')
  expect(user.isServer).toBeFalsy()
  const server = new Creator('server:uuid', '10', '2.4.0')
  expect(server.isServer).toBeTruthy()
})

it('checks subprotocol', () => {
  const creator = new Creator('10:uuid', '10', '2.4.0')
  expect(creator.isSubprotocol('^2.0')).toBeTruthy()
  expect(creator.isSubprotocol('>2.5')).toBeFalsy()
})
