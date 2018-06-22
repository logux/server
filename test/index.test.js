const BaseServer = require('../base-server')
const Server = require('../server')
const index = require('../')

it('has BaseServer class', () => {
  expect(index.BaseServer).toBe(BaseServer)
})

it('has Server class', () => {
  expect(index.Server).toBe(Server)
})

it('has allowed meta keys list', () => {
  for (const key of index.ALLOWED_META) {
    expect(typeof key).toEqual('string')
  }
})
