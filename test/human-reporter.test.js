'use strict'

const processReporter = require('../reporters/human/process')

const ServerConnection = require('logux-sync').ServerConnection
const createServer = require('http').createServer
const SyncError = require('logux-sync').SyncError
const path = require('path')

const BaseServer = require('../base-server')
const Client = require('../client')

const DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

function reportersOut () {
  return processReporter.apply({}, arguments)
    .replace(/\r\v/g, '\n')
    .replace(DATE, '1970-01-01 00:00:00')
}

const app = new BaseServer({
  env: 'development',
  pid: 21384,
  subprotocol: '2.5.0',
  supports: '2.x || 1.x',
  host: '127.0.0.1',
  port: 1337
})
app.nodeId = 'server:H1f8LAyzl'

const ws = {
  _socket: {
    remoteAddress: '127.0.0.1'
  },
  on: () => { }
}

const authed = new Client(app, new ServerConnection(ws), 1)
authed.sync.remoteSubprotocol = '1.0.0'
authed.sync.remoteProtocol = [0, 0]
authed.id = '100'
authed.user = { }
authed.nodeId = '100:H10Nf5stl'

const noUserId = new Client(app, new ServerConnection(ws), 1)
noUserId.sync.remoteSubprotocol = '1.0.0'
noUserId.sync.remoteProtocol = [0, 0]
noUserId.user = { }
noUserId.nodeId = 'H10Nf5stl'

const unauthed = new Client(app, new ServerConnection(ws), 1)

const ownError = new SyncError(authed.sync, 'timeout', 5000, false)
const clientError = new SyncError(authed.sync, 'timeout', 5000, true)

const action = {
  type: 'CHANGE_USER',
  id: 100,
  data: { name: 'John' }
}
const meta = {
  id: [1487805099387, authed.nodeId, 0],
  time: 1487805099387,
  reasons: ['lastValue', 'debug'],
  user: authed.nodeId,
  server: 'server:H1f8LAyzl'
}

it('reports listen', () => {
  expect(reportersOut('listen', app)).toMatchSnapshot()
})

it('reports production', () => {
  const wss = new BaseServer({
    env: 'production',
    pid: 21384,
    subprotocol: '1.0.0',
    supports: '1.x',
    cert: 'A',
    key: 'B',
    host: '0.0.0.0',
    port: 1337
  })
  wss.nodeId = 'server:H1f8LAyzl'

  expect(reportersOut('listen', wss)).toMatchSnapshot()
})

it('reports http', () => {
  const http = new BaseServer({
    env: 'development',
    pid: 21384,
    subprotocol: '1.0.0',
    supports: '1.x',
    server: createServer()
  })
  http.nodeId = 'server:H1f8LAyzl'

  expect(reportersOut('listen', http)).toMatchSnapshot()
})

it('reports connect', () => {
  expect(reportersOut('connect', app, authed)).toMatchSnapshot()
})

it('reports authenticated', () => {
  expect(reportersOut('authenticated', app, authed)).toMatchSnapshot()
})

it('reports authenticated without user ID', () => {
  expect(reportersOut('authenticated', app, noUserId)).toMatchSnapshot()
})

it('reports bad authenticated', () => {
  expect(reportersOut('unauthenticated', app, authed)).toMatchSnapshot()
})

it('reports action', () => {
  expect(reportersOut('add', app, action, meta)).toMatchSnapshot()
})

it('reports clean', () => {
  expect(reportersOut('clean', app, action, meta)).toMatchSnapshot()
})

it('reports denied', () => {
  expect(reportersOut('denied', app, action, meta)).toMatchSnapshot()
})

it('reports processed', () => {
  expect(reportersOut('processed', app, action, meta, 500)).toMatchSnapshot()
})

it('reports unknowType', () => {
  expect(reportersOut('unknowType', app, action, meta)).toMatchSnapshot()
})

it('reports unknowType from server', () => {
  const serverMeta = { id: [1, 'server:hfeb5', 0] }
  expect(reportersOut('unknowType', app, action, serverMeta)).toMatchSnapshot()
})

it('reports disconnect', () => {
  expect(reportersOut('disconnect', app, authed)).toMatchSnapshot()
})

it('reports disconnect from unauthenticated user', () => {
  expect(reportersOut('disconnect', app, unauthed)).toMatchSnapshot()
})

it('reports error', () => {
  const file = __filename
  const jest = path.join(__dirname, '../node_modules/jest/index.js')
  const error = new Error('Some mistake')
  const errorStack = [
    `${ error.name }: ${ error.message }`,
    `    at Object.<anonymous> (${ file }:28:13)`,
    `    at Module._compile (module.js:573:32)`,
    `    at at runTest (${ jest }:50:10)`,
    `    at process._tickCallback (internal/process/next_tick.js:103:7)`
  ]
  error.stack = errorStack.join('\n')

  const out = reportersOut('runtimeError', app, error, action, meta)
  expect(out).toMatchSnapshot()
})

it('reports client error', () => {
  const out = reportersOut('clientError', app, authed, clientError)
  expect(out).toMatchSnapshot()
})

it('reports synchroniation error', () => {
  const out = reportersOut('syncError', app, authed, ownError)
  expect(out).toMatchSnapshot()
})

it('reports error from unautheficated user', () => {
  const out = reportersOut('syncError', app, unauthed, clientError)
  expect(out).toMatchSnapshot()
})

it('reports zombie', () => {
  expect(reportersOut('zombie', app, authed)).toMatchSnapshot()
})

it('reports destroy', () => {
  expect(reportersOut('destroy', app)).toMatchSnapshot()
})

it('handles EACCESS error', () => {
  expect(reportersOut('error', app, { code: 'EACCES' }, app)).toMatchSnapshot()
})

it('handles error in production', () => {
  const http = new BaseServer({
    env: 'production',
    pid: 21384,
    subprotocol: '2.5.0',
    supports: '2.x || 1.x',
    host: '127.0.0.1',
    port: 1000
  })
  http.nodeId = 'server:H1f8LAyzl'

  expect(reportersOut('error', app, { code: 'EACCES', port: 1000 }, http))
    .toMatchSnapshot()
})

it('handles EADDRINUSE error', () => {
  expect(reportersOut('error', app, {
    code: 'EADDRINUSE',
    port: 1337
  }, app)).toMatchSnapshot()
})

it('throws on undefined error', () => {
  const e = {
    code: 'EAGAIN',
    message: 'resource temporarily unavailable'
  }
  function errorHelperThrow () {
    reportersOut('error', app, e)
  }
  expect(errorHelperThrow).toThrowError(/resource temporarily unavailable/)
})
