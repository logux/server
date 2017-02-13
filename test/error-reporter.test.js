var errorReporter = require('../error-reporter')
var reporter = require('../reporter')

function errorHelperOut () {
  return errorReporter.apply({}, arguments).replace(/\r\v/g, '\n')
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
beforeAll(() => {
  reporter.now = () => {
    return new Date((new Date()).getTimezoneOffset() * 60000)
  }
})
afterAll(() => {
  reporter.now = originNow
})

it('handles EACCESS error', () => {
  expect(errorHelperOut({ code: 'EACCES' }, app)).toMatchSnapshot()
})

it('handles error in production', () => {
  var http = new BaseServer({
    env: 'production',
    pid: 21384,
    nodeId: 'server:H1f8LAyzl',
    subprotocol: '2.5.0',
    supports: '2.x || 1.x'
  })
  http.listenOptions = { host: '127.0.0.1', port: 1000 }

  expect(errorHelperOut({ code: 'EACCES', port: 1000 }, http)).toMatchSnapshot()
})

it('handles EADDRINUSE error', () => {
  expect(errorHelperOut({
    code: 'EADDRINUSE',
    port: 1337
  }, app)).toMatchSnapshot()
})

it('throws on undefined error', () => {
  var e = {
    code: 'EAGAIN',
    message: 'resource temporarily unavailable'
  }
  function errorHelperThrow () {
    errorHelperOut(e, app)
  }
  expect(errorHelperThrow).toThrowError(/resource temporarily unavailable/)
})
