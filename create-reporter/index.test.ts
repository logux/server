import { LoguxError } from '@logux/core'

import { existsSync, statSync, readFileSync } from 'fs'
import { jest } from '@jest/globals'
import { join } from 'path'
import pino from 'pino'
import os from 'os'

import { createReporter, PATH_TO_PRETTIFYING_PINO_TRANSPORT } from './index.js'

// Source: https://github.com/pinojs/pino/blob/03dac4d1b7e567f4a70f5fb448acc0ea8b75b2a6/test/helper.js#L55
export function watchFileCreated(filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let TIMEOUT = Number(process.env.PINO_TEST_WAIT_WATCHFILE_TIMEOUT) || 4000
    let INTERVAL = 100
    let threshold = TIMEOUT / INTERVAL
    let counter = 0
    let interval = setInterval(() => {
      let exists = existsSync(filename)
      // On some CI runs file is created but not filled
      if (exists && statSync(filename).size !== 0) {
        clearInterval(interval)
        resolve()
      } else if (counter <= threshold) {
        counter++
      } else {
        clearInterval(interval)
        reject(
          new Error(
            `${filename} hasn't been created within ${TIMEOUT} ms. ` +
              (exists
                ? 'File exist, but still empty.'
                : 'File not yet created.')
          )
        )
      }
    }, INTERVAL)
  })
}

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

async function check(type: string, details?: object): Promise<void> {
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

  let destination = join(
    os.tmpdir(),
    '_' + Math.random().toString(36).substr(2, 9)
  )
  let logger = pino(
    pino.transport({
      target: PATH_TO_PRETTIFYING_PINO_TRANSPORT,
      options: {
        basepath: '/dev/app/',
        destination
      }
    })
  )
  let humanReporter = createReporter({
    logger
  })

  humanReporter(type, details)
  await watchFileCreated(destination)
  expect(clean(readFileSync(destination).toString())).toMatchSnapshot()
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

it('creates human reporter', async () => {
  let destination = join(
    os.tmpdir(),
    '_' + Math.random().toString(36).substr(2, 9)
  )

  let reporter = createReporter({
    logger: {
      destination,
      type: 'human'
    },
    root: '/dir/'
  })
  reporter('unknownType', {})
  await watchFileCreated(destination)
  expect(clean(readFileSync(destination).toString())).toMatchSnapshot()
})

it('adds trailing slash to path', () => {
  let reporter = createReporter({ logger: 'human', root: '/dir' })
  expect(reporter.logger._basepath).toEqual('/dir/')
})

it('uses colors by default', () => {
  delete process.env.NODE_ENV
  let reporter = createReporter({ logger: 'human' })
  expect(reporter.logger._color).toBe(true)
})

it('uses color in development', () => {
  let reporter = createReporter({ env: 'development', logger: 'human' })
  expect(reporter.logger._color).toBe(true)
})

it('uses environment variable to detect environment', () => {
  process.env.NODE_ENV = 'production'
  let reporter = createReporter({ logger: 'human' })
  expect(reporter.logger._color).toBe(false)
})

it('reports listen', async () => {
  await check('listen', {
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

it('reports listen for production', async () => {
  await check('listen', {
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

it('reports listen for custom domain', async () => {
  await check('listen', {
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

it('reports connect', async () => {
  await check('connect', { connectionId: '670', ipAddress: '10.110.6.56' })
})

it('reports authenticated', async () => {
  await check('authenticated', {
    connectionId: '670',
    subprotocol: '1.0.0',
    nodeId: 'admin:100:uImkcF4z'
  })
})

it('reports authenticated without user ID', async () => {
  await check('authenticated', {
    connectionId: '670',
    subprotocol: '1.0.0',
    nodeId: 'uImkcF4z'
  })
})

it('reports unauthenticated', async () => {
  await check('unauthenticated', {
    connectionId: '670',
    subprotocol: '1.0.0',
    nodeId: '100:uImkcF4z'
  })
})

it('reports add', async () => {
  await check('add', {
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

it('reports add and clean', async () => {
  await check('addClean', {
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
  expect(() =>
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
  ).rejects.toThrow('Circular reference in action')
})

it('reports clean', async () => {
  await check('clean', {
    actionId: '1487805099387 100:uImkcF4z 0'
  })
})

it('reports denied', async () => {
  await check('denied', {
    actionId: '1487805099387 100:uImkcF4z 0'
  })
})

it('reports unknownType', async () => {
  await check('unknownType', {
    type: 'CHANGE_SER',
    actionId: '1487805099387 100:vAApgNT9 0'
  })
})

it('reports unknownType from server', async () => {
  await check('unknownType', {
    type: 'CHANGE_SER',
    actionId: '1650269021700 server:FnXaqDxY 0'
  })
})

it('reports wrongChannel', async () => {
  await check('wrongChannel', {
    actionId: '1650269045800 100:IsvVzqWx 0',
    channel: 'ser/100'
  })
})

it('reports wrongChannel without name', async () => {
  await check('wrongChannel', {
    channel: undefined,
    actionId: '1650269056600 100:uImkcF4z 0'
  })
})

it('reports subscribed', async () => {
  await check('subscribed', {
    channel: 'user/100',
    actionId: '1487805099387 100:uImkcF4z 0'
  })
})

it('reports unsubscribed', async () => {
  await check('unsubscribed', {
    channel: 'user/100',
    actionId: '1650271940900 100:uImkcF4z 0'
  })
})

it('reports disconnect', async () => {
  await check('disconnect', { nodeId: '100:uImkcF4z' })
})

it('reports disconnect from unauthenticated user', async () => {
  await check('disconnect', { connectionId: '670' })
})

it('reports zombie', async () => {
  await check('zombie', { nodeId: '100:uImkcF4z' })
})

it('reports wrongControlIp', async () => {
  await check('wrongControlIp', {
    ipAddress: '6.0.0.1',
    mask: '127.0.0.1/8'
  })
})

it('reports wrongControlSecret', async () => {
  await check('wrongControlSecret', {
    ipAddress: '6.0.0.1',
    wrongSecret: 'ArgDCPc1IxfU97V1ukeN6'
  })
})

it('reports destroy', async () => {
  await check('destroy')
})

it('reports EACCES error', async () => {
  await check('error', { fatal: true, err: { code: 'EACCES', port: 80 } })
})

it('reports EADDRINUSE error', async () => {
  await check('error', {
    fatal: true,
    err: { code: 'EADDRINUSE', port: 31337 }
  })
})

it('reports LOGUX_NO_CONTROL_SECRET error', async () => {
  let err = {
    code: 'LOGUX_NO_CONTROL_SECRET',
    message: '`backend` requires also `controlSecret` option'
  }
  await check('error', { fatal: true, err })
})

it('reports Logux error', async () => {
  let err = {
    message: 'Unknown option `suprotocol` in server constructor',
    logux: true,
    note:
      'Maybe there is a mistake in option name or this version ' +
      'of Logux Server doesn’t support this option'
  }
  await check('error', { fatal: true, err })
})

it('reports error', async () => {
  await check('error', {
    fatal: true,
    err: createError('Error', 'Some mistake')
  })
})

it('reports error from action', async () => {
  await check('error', {
    actionId: '1487805099387 100:uImkcF4z 0',
    err: createError('Error', 'Some mistake')
  })
})

it('reports error with token', async () => {
  await check('error', {
    actionId: '1487805099387 100:uImkcF4z 0',
    err: createError('Error', '{"Authorization":"Bearer secret"}')
  })
})

it('reports sync error', async () => {
  let err = new LoguxError('unknown-message', 'bad', true)
  await check('error', { connectionId: '670', err })
})

it('reports error from client', async () => {
  let err = new LoguxError('timeout', 5000, true)
  await check('clientError', { connectionId: '670', err })
})

it('reports error from node', async () => {
  let err = new LoguxError('timeout', 5000, false)
  await check('clientError', { nodeId: '100:uImkcF4z', err })
})

it('reports useless actions', async () => {
  await check('useless', {
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

it("reports actions with metadata containing 'clients' array", async () => {
  await check('add', {
    action: {
      type: 'ADD_USER',
      id: 100,
      name: 'John'
    },
    meta: {
      clients: ['1:-lCr7e9s', '2:wv0r_O5C'],
      id: '1487805099387 100:uImkcF4z 0',
      time: 1487805099387,
      reasons: [],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0'
    }
  })
})

it("reports actions with metadata containing 'excludeClients' array", async () => {
  await check('add', {
    action: {
      type: 'ADD_USER',
      id: 100,
      name: 'John'
    },
    meta: {
      excludeClients: ['1:-lCr7e9s', '2:wv0r_O5C'],
      id: '1487805099387 100:uImkcF4z 0',
      time: 1487805099387,
      reasons: [],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0'
    }
  })
})
