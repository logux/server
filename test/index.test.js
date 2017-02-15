var BaseServer = require('../base-server')
var Server = require('../server')
var index = require('../')

it('has BaseServer class', () => {
  expect(index.BaseServer).toBe(BaseServer)
})

it('has Server class', () => {
  expect(index.Server).toBe(Server)
})
