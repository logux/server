'use strict'

const ServerConnection = require('logux-sync').ServerConnection
const createServer = require('http').createServer
const MemoryStream = require('memory-stream')
const SyncError = require('logux-sync').SyncError
const bunyan = require('bunyan')
const path = require('path')

const processReporter = require('../bunyan-reporter')
const HumanFormatter = require('../human-formatter')
const ServerClient = require('../server-client')
const BaseServer = require('../base-server')

const DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

function bunyanLog (logger, payload) {
  const details = payload.details || { }
  logger[payload.level](details, payload.msg)
}

function reportersOut (type, app) {
  const payload = processReporter.apply({ }, arguments)
  const stream = new HumanFormatter(app, new MemoryStream())
  const bunyanLogger = bunyan.createLogger({
    name: 'logux-server-test',
    streams: [{ type: 'raw', stream }]
  })

  bunyanLog(bunyanLogger, payload)

  return new Promise(resolve => {
    setTimeout(() => {
      const result = stream.out
        .toString()
        .replace(/\r\v/g, '\n')
        .replace(DATE, '1970-01-01 00:00:00')
        .replace(/PID:.+\n/g, 'PID:          21384\n')
      resolve(result)
    }, 50)
  })
}

const log = bunyan.createLogger({
  name: 'logux-server-test',
  streams: []
})

const app = new BaseServer({
  env: 'development',
  pid: 21384,
  subprotocol: '2.5.0',
  supports: '2.x || 1.x',
  host: '127.0.0.1',
  port: 1337,
  reporter: 'bunyan',
  bunyanLogger: log
})
app.nodeId = 'server:H1f8LAyzl'

const ws = {
  _socket: {
    remoteAddress: '127.0.0.1'
  },
  on: () => { }
}

const authed = new ServerClient(app, new ServerConnection(ws), 1)
authed.sync.remoteSubprotocol = '1.0.0'
authed.sync.remoteProtocol = [0, 0]
authed.id = '100'
authed.user = { }
authed.nodeId = '100:H10Nf5stl'

const noUserId = new ServerClient(app, new ServerConnection(ws), 1)
noUserId.sync.remoteSubprotocol = '1.0.0'
noUserId.sync.remoteProtocol = [0, 0]
noUserId.user = { }
noUserId.nodeId = 'H10Nf5stl'

const unauthed = new ServerClient(app, new ServerConnection(ws), 1)

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
  return reportersOut('listen', app).then(data => {
    expect(data).toMatchSnapshot()
  })
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

  return reportersOut('listen', wss).then(data => {
    expect(data).toMatchSnapshot()
  })
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

  return reportersOut('listen', http).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports connect', () => {
  return reportersOut('connect', app, authed).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports authenticated', () => {
  return reportersOut('authenticated', app, authed).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports authenticated without user ID', () => {
  return reportersOut('authenticated', app, noUserId).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports bad authenticated', () => {
  return reportersOut('unauthenticated', app, authed).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports action', () => {
  return reportersOut('add', app, action, meta).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports clean', () => {
  return reportersOut('clean', app, action, meta).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports denied', () => {
  return reportersOut('denied', app, action, meta).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports processed', () => {
  return reportersOut('processed', app, action, meta, 500).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports unknownType', () => {
  return reportersOut('unknownType', app, action, meta).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports unknownType from server', () => {
  const serverMeta = { id: [1, 'server:hfeb5', 0] }
  return reportersOut('unknownType', app, action, serverMeta).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports disconnect', () => {
  return reportersOut('disconnect', app, authed).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports disconnect from unauthenticated user', () => {
  return reportersOut('disconnect', app, unauthed).then(data => {
    expect(data).toMatchSnapshot()
  })
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
  return out.then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports client error', () => {
  const out = reportersOut('clientError', app, authed, clientError)
  return out.then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports synchronization error', () => {
  const out = reportersOut('syncError', app, authed, ownError)
  return out.then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports error from unautheficated user', () => {
  const out = reportersOut('syncError', app, unauthed, clientError)
  return out.then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports zombie', () => {
  return reportersOut('zombie', app, authed).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('reports destroy', () => {
  return reportersOut('destroy', app).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('handles EACCES error', () => {
  return reportersOut('error', app, { code: 'EACCES' }, app).then(data => {
    expect(data).toMatchSnapshot()
  })
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

  return reportersOut('error', app, { code: 'EACCES', port: 1000 }, http)
    .then(data => {
      expect(data).toMatchSnapshot()
    })
})

it('handles EADDRINUSE error', () => {
  return reportersOut(
    'error', app, {
      code: 'EADDRINUSE',
      port: 1337
    }, app).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('handles Logux initialization error: unknown option', () => {
  return reportersOut('error', app, {
    code: 'LOGUX_UNKNOWN_OPTION',
    option: 'test'
  }, app).then(data => {
    expect(data).toMatchSnapshot()
  })
})

it('handles Logux initialization error: subprotocol', () => {
  return reportersOut('error', app, {
    code: 'LOGUX_WRONG_OPTIONS',
    message: 'Missed client subprotocol requirements'
  }, app).then(data => {
    expect(data).toMatchSnapshot()
  })
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
