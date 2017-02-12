const BaseServer = require('../base-server')
const Server = require('../server')
const index = require('../')

it('has BaseServer class', () => {
  expect(index.BaseServer).toBe(BaseServer)
})

it('has Server class', () => {
  expect(index.Server).toBe(Server)
})
