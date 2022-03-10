import { LoguxError } from '@logux/core'

import { createReporter } from '../create-reporter/index.js'
import { humanFormatter } from '../human-formatter/index.js'
import { jest } from '@jest/globals'
import pino from 'pino'

jest.mock('os', () => {
  return {
    hostname: () => 'localhost',
    platform: () => 'linux',
    EOL: '\n'
  }
})

class MemoryStream {
  string: string

  constructor() {
    this.string = ''
  }

  write(chunk: string): void {
    this.string += chunk
  }
}

function clean(str: string): string {
  return str
    .replace(/\r\v/g, '\n')
    .replace(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/g, '1970-01-01 00:00:00')
    .replace(/"time":"[^"]+"/g, '"time":"1970-01-01T00:00:00.000Z"')
    .replace(/"hostname":"[^"]+"/g, '"hostname":"localhost"')
    .replace(/"pid":\d+/g, '"pid":21384')
    .replace(/PID:(\s+.*m)\d+(.*m)/, 'PID:$121384$2')
}

function check(type: string, details?: object): void {
  let json = new MemoryStream()
  let jsonReporter = createReporter({
    logger: pino(
      {
        name: 'test',
        timestamp: pino.stdTimeFunctions.isoTime
      },
      json
    )
  })

  jsonReporter(type, details)
  expect(clean(json.string)).toMatchSnapshot()

  let human = new MemoryStream()
  let humanReporterOpts = {
    suppressFlushSyncWarning: true,
    basepath: '/dev/app',
    color: true
  }
  let humanReporter = createReporter({
    logger: pino(
      {
        name: 'test',
        prettyPrint: humanReporterOpts as any,
        prettifier: humanFormatter
      },
      human
    )
  })

  humanReporter(type, details)
  expect(clean(human.string)).toMatchSnapshot()
}

function createError(name: string, message: string): Error {
  let err = new Error(message)
  err.name = name
  err.stack =
    `${name}: ${message}\n` +
    '    at Object.<anonymous> (/dev/app/index.js:28:13)\n' +
    '    at Module._compile (module.js:573:32)\n' +
    '    at at runTest (/dev/app/node_modules/jest/index.js:50:10)\n' +
    '    at process._tickCallback (internal/process/next_tick.js:103:7)'
  return err
}

let originEnv = process.env.NODE_ENV
afterEach(() => {
  process.env.NODE_ENV = originEnv
})

it('uses passed logger instance', () => {
  let logger = pino({ name: 'test' })
  let reporter = createReporter({ logger })
  expect(reporter.logger).toEqual(logger)
})

it('creates JSON reporter', () => {
  let reporterStream = new MemoryStream()
  let reporter = createReporter({ logger: { stream: reporterStream } })
  reporter('unknownType', {})
  expect(clean(reporterStream.string)).toMatchSnapshot()
})

it('creates human reporter', () => {
  let reporterStream = new MemoryStream()
  let reporter = createReporter({
    logger: {
      stream: reporterStream,
      type: 'human'
    },
    root: '/dir/'
  })
  reporter('unknownType', {})
  expect(clean(reporterStream.string)).toMatchSnapshot()
})

it('adds trailing slash to path', () => {
  let reporter = createReporter({ logger: 'human', root: '/dir' })
  expect(reporter.logger.basepath).toEqual('/dir/')
})

it('uses colors by default', () => {
  delete process.env.NODE_ENV
  let reporter = createReporter({ logger: 'human' })
  expect(reporter.logger.color).toBe(true)
})

it('uses color in development', () => {
  let reporter = createReporter({ env: 'development', logger: 'human' })
  expect(reporter.logger.color).toBe(true)
})

it('uses environment variable to detect environment', () => {
  process.env.NODE_ENV = 'production'
  let reporter = createReporter({ logger: 'human' })
  expect(reporter.logger.color).toBe(false)
})

it('reports listen', () => {
  check('listen', {
    controlSecret: 'RhBaK0kuOBtqJalq2C4df',
    loguxServer: '0.0.0',
    environment: 'development',
    controlMask: '127.0.0.0/255',
    subprotocol: '0.0.0',
    supports: '0.x',
    backend: 'http://127.0.0.1:3000/logux',
    nodeId: 'server:FnXaqDxY',
    server: false,
    notes: {},
    redis: undefined,
    cert: false,
    host: '127.0.0.1',
    port: 31337
  })
})

it('reports listen for production', () => {
  check('listen', {
    controlSecret: 'RhBaK0kuOBtqJalq2C4df',
    loguxServer: '0.0.0',
    environment: 'production',
    subprotocol: '0.0.0',
    supports: '0.x',
    nodeId: 'server:FnXaqDxY',
    server: false,
    notes: {},
    redis: '//localhost',
    cert: true,
    host: '127.0.0.1',
    port: 31337
  })
})

it('reports listen for custom domain', () => {
  check('listen', {
    loguxServer: '0.0.0',
    environment: 'development',
    subprotocol: '0.0.0',
    supports: '0.x',
    nodeId: 'server:FnXaqDxY',
    server: true,
    notes: {
      prometheus: 'http://127.0.0.1:31338/prometheus'
    }
  })
})

it('reports connect', () => {
  check('connect', { connectionId: '670', ipAddress: '10.110.6.56' })
})

it('reports authenticated', () => {
  check('authenticated', {
    connectionId: '670',
    subprotocol: '1.0.0',
    nodeId: 'admin:100:uImkcF4z'
  })
})

it('reports authenticated without user ID', () => {
  check('authenticated', {
    connectionId: '670',
    subprotocol: '1.0.0',
    nodeId: 'uImkcF4z'
  })
})

it('reports unauthenticated', () => {
  check('unauthenticated', {
    connectionId: '670',
    subprotocol: '1.0.0',
    nodeId: '100:uImkcF4z'
  })
})

it('reports add', () => {
  check('add', {
    action: {
      type: 'CHANGE_USER',
      id: 100,
      data: {
        name: 'John',
        role: null,
        array: [1, [2], { a: '1', b: { c: 2 }, d: [], e: null }, null]
      }
    },
    meta: {
      id: '1487805099387 100:uImkcF4z 0',
      time: 1487805099387,
      reasons: ['lastValue', 'debug'],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0'
    }
  })
})

it('reports add and clean', () => {
  check('addClean', {
    action: {
      type: 'CHANGE_USER',
      id: 100,
      data: {
        name: 'John',
        role: null,
        array: [1, [2], { a: '1', b: { c: 2 }, d: [], e: null }, null]
      }
    },
    meta: {
      id: '1487805099387 100:uImkcF4z 0',
      time: 1487805099387,
      reasons: ['lastValue', 'debug'],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0'
    }
  })
})

it('throws on circulal reference', () => {
  let a: { b: any } = { b: undefined }
  let b: { a: any } = { a: undefined }
  a.b = b
  b.a = a
  expect(() => {
    check('add', {
      action: { type: 'CHANGE_USER', a },
      meta: {
        id: '1487805099387 100:uImkcF4z 0',
        time: 1487805099387,
        reasons: ['lastValue', 'debug'],
        server: 'server:H1f8LAyzl',
        subprotocol: '1.0.0'
      }
    })
  }).toThrow('Circular reference in action')
})

it('reports clean', () => {
  check('clean', {
    actionId: '1487805099387 100:uImkcF4z 0'
  })
})

it('reports denied', () => {
  check('denied', {
    actionId: '1487805099387 100:uImkcF4z 0'
  })
})

it('reports unknownType', () => {
  check('unknownType', {
    type: 'CHANGE_SER',
    actionId: '1487805099387 100:uImkcF4z 0'
  })
})

it('reports unknownType from server', () => {
  check('unknownType', {
    type: 'CHANGE_SER',
    actionId: '1487805099387 server:FnXaqDxY 0'
  })
})

it('reports wrongChannel', () => {
  check('wrongChannel', {
    actionId: '1487805099387 100:uImkcF4z 0',
    channel: 'ser/100'
  })
})

it('reports wrongChannel without name', () => {
  check('wrongChannel', {
    channel: undefined,
    actionId: '1487805099387 100:uImkcF4z 0'
  })
})

it('reports subscribed', () => {
  check('subscribed', {
    channel: 'user/100',
    actionId: '1487805099387 100:uImkcF4z 0'
  })
})

it('reports unsubscribed', () => {
  check('unsubscribed', {
    channel: 'user/100',
    actionId: '1487805099387 100:uImkcF4z 0'
  })
})

it('reports disconnect', () => {
  check('disconnect', { nodeId: '100:uImkcF4z' })
})

it('reports disconnect from unauthenticated user', () => {
  check('disconnect', { connectionId: '670' })
})

it('reports zombie', () => {
  check('zombie', { nodeId: '100:uImkcF4z' })
})

it('reports wrongControlIp', () => {
  check('wrongControlIp', {
    ipAddress: '6.0.0.1',
    mask: '127.0.0.1/8'
  })
})

it('reports wrongControlSecret', () => {
  check('wrongControlSecret', {
    ipAddress: '6.0.0.1',
    wrongSecret: 'ArgDCPc1IxfU97V1ukeN6'
  })
})

it('reports destroy', () => {
  check('destroy')
})

it('reports EACCES error', () => {
  check('error', { fatal: true, err: { code: 'EACCES', port: 80 } })
})

it('reports EADDRINUSE error', () => {
  check('error', { fatal: true, err: { code: 'EADDRINUSE', port: 31337 } })
})

it('reports LOGUX_NO_CONTROL_SECRET error', () => {
  let err = {
    code: 'LOGUX_NO_CONTROL_SECRET',
    message: '`backend` requires also `controlSecret` option'
  }
  check('error', { fatal: true, err })
})

it('reports Logux error', () => {
  let err = {
    message: 'Unknown option `suprotocol` in server constructor',
    logux: true,
    note:
      'Maybe there is a mistake in option name or this version ' +
      'of Logux Server doesn’t support this option'
  }
  check('error', { fatal: true, err })
})

it('reports error', () => {
  check('error', { fatal: true, err: createError('Error', 'Some mistake') })
})

it('reports error from action', () => {
  check('error', {
    actionId: '1487805099387 100:uImkcF4z 0',
    err: createError('Error', 'Some mistake')
  })
})

it('reports error with token', () => {
  check('error', {
    actionId: '1487805099387 100:uImkcF4z 0',
    err: createError('Error', '{"Authorization":"Bearer secret"}')
  })
})

it('reports sync error', () => {
  let err = new LoguxError('unknown-message', 'bad', true)
  check('error', { connectionId: '670', err })
})

it('reports error from client', () => {
  let err = new LoguxError('timeout', 5000, true)
  check('clientError', { connectionId: '670', err })
})

it('reports error from node', () => {
  let err = new LoguxError('timeout', 5000, false)
  check('clientError', { nodeId: '100:uImkcF4z', err })
})

it('reports useless actions', () => {
  check('useless', {
    action: {
      type: 'ADD_USER',
      id: 100,
      name: 'John'
    },
    meta: {
      id: '1487805099387 100:uImkcF4z 0',
      time: 1487805099387,
      reasons: [],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0'
    }
  })
})
