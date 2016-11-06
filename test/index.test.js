var BaseServer = require('../base-server')
var Server = require('../server')
var index = require('../')

it('has BaseServer class', function () {
  expect(index.BaseServer).toBe(BaseServer)
})

it('has Server class', function () {
  expect(index.Server).toBe(Server)
})
