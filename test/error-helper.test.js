var errorHelper = require('../error-helper')
var logHelper = require('../log-helper')

function normalizeNewlines (string) {
  // use local copy of Jest newline normalization function
  // until Jest doens't apply normalization on comprasion
  return string.replace(/\r\n|\r/g, '\n')
}

function errorHelperOut () {
  return normalizeNewlines(errorHelper.apply({}, arguments))
}

it('uses current time by default', function () {
  expect(logHelper.now().getTime()).toBeCloseTo(Date.now(), -1)
})

var BaseServer = require('../base-server')

var app = new BaseServer({
  env: 'development',
  pid: 21384,
  nodeId: 'server:H1f8LAyzl',
  subprotocol: '2.5.0',
  supports: '2.x || 1.x'
})
app.listenOptions = { host: '127.0.0.1', port: 1337 }

describe('mocked output', function () {
  var originNow = logHelper.now
  beforeAll(function () {
    logHelper.now = function () {
      return new Date((new Date()).getTimezoneOffset() * 60000)
    }
  })
  afterAll(function () {
    logHelper.now = originNow
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
