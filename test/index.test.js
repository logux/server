var BaseServer = require('../base-server')
var index = require('../')

it('has BaseServer class', function () {
  expect(index.BaseServer).toBe(BaseServer)
})
