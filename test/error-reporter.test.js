var errorReporter = require('../error-reporter')
var reporter = require('../reporter')

function errorHelperOut () {
  // use local copy of Jest newline normalization function
  // until Jest doens't apply normalization on comprasion
  return errorReporter.apply({}, arguments).replace(/\r\n|\r/g, '\n')
}

var BaseServer = require('../base-server')

var app = new BaseServer({
  env: 'development',
  pid: 21384,
  nodeId: 'server:H1f8LAyzl',
  subprotocol: '2.5.0',
  supports: '2.x || 1.x'
})
app.listenOptions = { host: '127.0.0.1', port: 1337 }

var originNow = reporter.now
beforeAll(function () {
  reporter.now = function () {
    return new Date((new Date()).getTimezoneOffset() * 60000)
  }
})
afterAll(function () {
  reporter.now = originNow
})

it('handle EACCESS error', function () {
  expect(errorHelperOut({code: 'EACCES'}, app)).toMatchSnapshot()
})

it('handle error in production', function () {
  var http = new BaseServer({
    env: 'production',
    pid: 21384,
    nodeId: 'server:H1f8LAyzl',
    subprotocol: '2.5.0',
    supports: '2.x || 1.x'
  })
  http.listenOptions = { host: '127.0.0.1', port: 1000 }

  expect(errorHelperOut({code: 'EACCES', port: 1000}, http)).toMatchSnapshot()
})

it('handle EADDRINUSE error', function () {
  expect(errorHelperOut({
    code: 'EADDRINUSE',
    port: 1337
  }, app)).toMatchSnapshot()
})

it('handle thorw on undefined error', function () {
  var e = {
    code: 'EAGAIN',
    message: 'resource temporarily unavailable'
  }
  function errorHelperThrow () {
    errorHelperOut(e, app)
  }
  expect(errorHelperThrow).toThrowErrorMatchingSnapshot()
})
