'use strict'

const SyncError = require('logux-sync').SyncError
const bunyan = require('bunyan')

const createReporter = require('../create-reporter')
const HumanFormatter = require('../human-formatter')

class MemoryStream {
  constructor () {
    this.string = ''
  }
  write (chunk) {
    this.string += chunk
  }
}

function clean (str) {
  return str
    .replace(/\r\v/g, '\n')
    .replace(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/g, '1970-01-01 00:00:00')
    .replace(/"time":"[^"]+"/g, '"time":"1970-01-01T00:00:00.000Z"')
    .replace(/"hostname":"[^"]+"/g, '"hostname":"localhost"')
}

function check (type, details) {
  const json = new MemoryStream()
  const jsonReporter = createReporter({
    bunyan: bunyan.createLogger({ name: 'test', pid: 21384, stream: json })
  })

  jsonReporter(type, details)
  expect(clean(json.string)).toMatchSnapshot()

  const human = new MemoryStream()
  const humanReporter = createReporter({
    bunyan: bunyan.createLogger({
      pid: 21384,
      name: 'test',
      streams: [
        {
          type: 'raw',
          stream: new HumanFormatter({
            basepath: '/dev/app', color: true, out: human
          })
        }
      ]
    })
  })

  humanReporter(type, details)
  expect(clean(human.string)).toMatchSnapshot()
}

function createError (name, message) {
  const err = new Error(message)
  err.name = name
  err.stack =
    `${ name }: ${ message }\n` +
    `    at Object.<anonymous> (/dev/app/index.js:28:13)\n` +
    `    at Module._compile (module.js:573:32)\n` +
    `    at at runTest (/dev/app/node_modules/jest/index.js:50:10)\n` +
    `    at process._tickCallback (internal/process/next_tick.js:103:7)`
  return err
}

const originEnv = process.env.NODE_ENV
afterEach(() => {
  process.env.NODE_ENV = originEnv
})

it('uses passed bunyan instance', () => {
  const logger = bunyan.createLogger({ name: 'test' })
  const reporter = createReporter({ bunyan: logger })
  expect(reporter.logger).toEqual(logger)
})

it('creates JSON reporter', () => {
  const logger = bunyan.createLogger({ name: 'test' })
  const reporter = createReporter({ reporter: 'json' })
  expect(reporter.logger.streams).toEqual(logger.streams)
})

it('creates human reporter', () => {
  const reporter = createReporter({ reporter: 'human', root: '/dir/' })
  expect(reporter.logger.streams).toHaveLength(1)
  const stream = reporter.logger.streams[0].stream
  expect(stream instanceof HumanFormatter).toBeTruthy()
  expect(stream.basepath).toEqual('/dir/')
  expect(stream.chalk.enabled).toBeFalsy()
})

it('adds trailing slash to path', () => {
  const reporter = createReporter({ reporter: 'human', root: '/dir' })
  expect(reporter.logger.streams[0].stream.basepath).toEqual('/dir/')
})

it('uses color in development', () => {
  const reporter = createReporter({ env: 'development', reporter: 'human' })
  expect(reporter.logger.streams[0].stream.chalk.enabled).toBeTruthy()
})

it('uses colors by default', () => {
  delete process.env.NODE_ENV
  const reporter = createReporter({ reporter: 'human' })
  expect(reporter.logger.streams[0].stream.chalk.enabled).toBeTruthy()
})

it('uses environment variable to detect environment', () => {
  process.env.NODE_ENV = 'production'
  const reporter = createReporter({ reporter: 'human' })
  expect(reporter.logger.streams[0].stream.chalk.enabled).toBeFalsy()
})

it('reports listen', () => {
  check('listen', {
    loguxServer: '0.0.0',
    environment: 'development',
    nodeId: 'server:FnXaqDxY',
    subprotocol: '0.0.0',
    supports: '0.x',
    server: false,
    cert: false,
    host: '127.0.0.1',
    port: '31337'
  })
})

it('reports listen for production', () => {
  check('listen', {
    loguxServer: '0.0.0',
    environment: 'production',
    nodeId: 'server:FnXaqDxY',
    subprotocol: '0.0.0',
    supports: '0.x',
    server: false,
    cert: true,
    host: '127.0.0.1',
    port: '1337'
  })
})

it('reports listen for custom domain', () => {
  check('listen', {
    loguxServer: '0.0.0',
    environment: 'development',
    nodeId: 'server:FnXaqDxY',
    subprotocol: '0.0.0',
    supports: '0.x',
    server: true
  })
})

it('reports connect', () => {
  check('connect', { clientId: '670', ipAddress: '10.110.6.56' })
})

it('reports authenticated', () => {
  check('authenticated', {
    subprotocol: '1.0.0',
    clientId: '670',
    nodeId: '100:uImkcF4z'
  })
})

it('reports authenticated without user ID', () => {
  check('authenticated', {
    subprotocol: '1.0.0',
    clientId: '670',
    nodeId: 'uImkcF4z'
  })
})

it('reports unauthenticated', () => {
  check('unauthenticated', {
    subprotocol: '1.0.0',
    clientId: '670',
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
      id: [1487805099387, '100:uImkcF4z', 0],
      time: 1487805099387,
      reasons: ['lastValue', 'debug'],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0'
    }
  })
})

it('reports clean', () => {
  check('clean', {
    actionId: [1487805099387, '100:uImkcF4z', 0]
  })
})

it('reports denied', () => {
  check('denied', {
    actionId: [1487805099387, '100:uImkcF4z', 0]
  })
})

it('reports unknownType', () => {
  check('unknownType', {
    type: 'CHANGE_SER', actionId: [1487805099387, '100:uImkcF4z', 0]
  })
})

it('reports unknownType from server', () => {
  check('unknownType', {
    type: 'CHANGE_SER',
    actionId: [1487805099387, 'server:FnXaqDxY', 0]
  })
})

it('reports wrongChannel', () => {
  check('wrongChannel', {
    actionId: [1487805099387, '100:uImkcF4z', 0],
    channel: 'ser/100'
  })
})

it('reports wrongChannel without name', () => {
  check('wrongChannel', {
    channel: undefined, actionId: [1487805099387, '100:uImkcF4z', 0]
  })
})

it('reports processed', () => {
  check('processed', {
    actionId: [1487805099387, '100:uImkcF4z', 0], latency: 500
  })
})

it('reports subscribed', () => {
  check('subscribed', {
    channel: 'user/100', actionId: [1487805099387, '100:uImkcF4z', 0]
  })
})

it('reports unsubscribed', () => {
  check('unsubscribed', {
    channel: 'user/100', actionId: [1487805099387, '100:uImkcF4z', 0]
  })
})

it('reports disconnect', () => {
  check('disconnect', { nodeId: '100:uImkcF4z' })
})

it('reports disconnect from unauthenticated user', () => {
  check('disconnect', { clientId: '670' })
})

it('reports zombie', () => {
  check('zombie', { nodeId: '100:uImkcF4z' })
})

it('reports destroy', () => {
  check('destroy')
})

it('reports EACCES error', () => {
  check('error', { fatal: true, err: { code: 'EACCES', port: 1337 } })
})

it('reports EADDRINUSE error', () => {
  check('error', { fatal: true, err: { code: 'EADDRINUSE', port: 31337 } })
})

it('reports LOGUX_UNKNOWN_OPTION error', () => {
  const err = {
    message: 'Unknown option `suprotocol` in server constructor',
    option: 'suprotocol',
    code: 'LOGUX_UNKNOWN_OPTION'
  }
  check('error', { fatal: true, err })
})

it('reports LOGUX_WRONG_OPTIONS error', () => {
  const err = {
    code: 'LOGUX_WRONG_OPTIONS',
    message: 'Missed client subprotocol requirements'
  }
  check('error', { fatal: true, err })
})

it('reports error', () => {
  check('error', { fatal: true, err: createError('Error', 'Some mistake') })
})

it('reports error from action', () => {
  check('error', {
    actionId: [1487805099387, '100:uImkcF4z', 0],
    err: createError('Error', 'Some mistake')
  })
})

it('reports error from client', () => {
  const err = new SyncError({ }, 'timeout', 5000, true)
  check('error', { clientId: '670', err })
})

it('reports error from sync', () => {
  const err = new SyncError({ }, 'timeout', 5000, false)
  check('error', { nodeId: '100:uImkcF4z', err })
})
