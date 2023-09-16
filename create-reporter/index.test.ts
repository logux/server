import { LoguxError } from '@logux/core'
import { nanoid } from 'nanoid'
import { existsSync, readFileSync, statSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import { afterEach, expect, it } from 'vitest'

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

  let destination = join(os.tmpdir(), '_' + nanoid())
  let logger = pino(
    pino.transport({
      options: {
        basepath: '/dev/app/',
        destination
      },
      target: PATH_TO_PRETTIFYING_PINO_TRANSPORT
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
    backend: 'http://127.0.0.1:3000/logux',
    cert: false,
    controlMask: '127.0.0.0/255',
    controlSecret: 'RhBaK0kuOBtqJalq2C4df',
    environment: 'development',
    host: '127.0.0.1',
    loguxServer: '0.0.0',
    nodeId: 'server:FnXaqDxY',
    notes: {},
    port: 31337,
    redis: undefined,
    server: false,
    subprotocol: '0.0.0',
    supports: '0.x'
  })
})

it('reports listen for production', async () => {
  await check('listen', {
    cert: true,
    controlSecret: 'RhBaK0kuOBtqJalq2C4df',
    environment: 'production',
    host: '127.0.0.1',
    loguxServer: '0.0.0',
    nodeId: 'server:FnXaqDxY',
    notes: {},
    port: 31337,
    redis: '//localhost',
    server: false,
    subprotocol: '0.0.0',
    supports: '0.x'
  })
})

it('reports listen for custom domain', async () => {
  await check('listen', {
    environment: 'development',
    loguxServer: '0.0.0',
    nodeId: 'server:FnXaqDxY',
    notes: {
      prometheus: 'http://127.0.0.1:31338/prometheus'
    },
    server: true,
    subprotocol: '0.0.0',
    supports: '0.x'
  })
})

it('reports connect', async () => {
  await check('connect', { connectionId: '670', ipAddress: '10.110.6.56' })
})

it('reports authenticated', async () => {
  await check('authenticated', {
    connectionId: '670',
    nodeId: 'admin:100:uImkcF4z',
    subprotocol: '1.0.0'
  })
})

it('reports authenticated without user ID', async () => {
  await check('authenticated', {
    connectionId: '670',
    nodeId: 'uImkcF4z',
    subprotocol: '1.0.0'
  })
})

it('reports unauthenticated', async () => {
  await check('unauthenticated', {
    connectionId: '670',
    nodeId: '100:uImkcF4z',
    subprotocol: '1.0.0'
  })
})

it('reports add', async () => {
  await check('add', {
    action: {
      data: {
        array: [1, [2], { a: '1', b: { c: 2 }, d: [], e: null }, null],
        name: 'John',
        role: null
      },
      id: 100,
      type: 'CHANGE_USER'
    },
    meta: {
      id: '1487805099387 100:uImkcF4z 0',
      reasons: ['lastValue', 'debug'],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0',
      time: 1487805099387
    }
  })
})

it('reports add and clean', async () => {
  await check('addClean', {
    action: {
      data: {
        array: [1, [2], { a: '1', b: { c: 2 }, d: [], e: null }, null],
        name: 'John',
        role: null
      },
      id: 100,
      type: 'CHANGE_USER'
    },
    meta: {
      id: '1487805099387 100:uImkcF4z 0',
      reasons: ['lastValue', 'debug'],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0',
      time: 1487805099387
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
      action: { a, type: 'CHANGE_USER' },
      meta: {
        id: '1487805099387 100:uImkcF4z 0',
        reasons: ['lastValue', 'debug'],
        server: 'server:H1f8LAyzl',
        subprotocol: '1.0.0',
        time: 1487805099387
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
    actionId: '1487805099387 100:vAApgNT9 0',
    type: 'CHANGE_SER'
  })
})

it('reports unknownType from server', async () => {
  await check('unknownType', {
    actionId: '1650269021700 server:FnXaqDxY 0',
    type: 'CHANGE_SER'
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
    actionId: '1650269056600 100:uImkcF4z 0',
    channel: undefined
  })
})

it('reports subscribed', async () => {
  await check('subscribed', {
    actionId: '1487805099387 100:uImkcF4z 0',
    channel: 'user/100'
  })
})

it('reports unsubscribed', async () => {
  await check('unsubscribed', {
    actionId: '1650271940900 100:uImkcF4z 0',
    channel: 'user/100'
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
  await check('error', { err: { code: 'EACCES', port: 80 }, fatal: true })
})

it('reports EADDRINUSE error', async () => {
  await check('error', {
    err: { code: 'EADDRINUSE', port: 31337 },
    fatal: true
  })
})

it('reports LOGUX_NO_CONTROL_SECRET error', async () => {
  let err = {
    code: 'LOGUX_NO_CONTROL_SECRET',
    message: '`backend` requires also `controlSecret` option'
  }
  await check('error', { err, fatal: true })
})

it('reports Logux error', async () => {
  let err = {
    logux: true,
    message: 'Unknown option `suprotocol` in server constructor',
    note:
      'Maybe there is a mistake in option name or this version ' +
      'of Logux Server doesn’t support this option'
  }
  await check('error', { err, fatal: true })
})

it('reports error', async () => {
  await check('error', {
    err: createError('Error', 'Some mistake'),
    fatal: true
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
  await check('clientError', { err, nodeId: '100:uImkcF4z' })
})

it('reports useless actions', async () => {
  await check('useless', {
    action: {
      id: 100,
      name: 'John',
      type: 'ADD_USER'
    },
    meta: {
      id: '1487805099387 100:uImkcF4z 0',
      reasons: [],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0',
      time: 1487805099387
    }
  })
})

it("reports actions with metadata containing 'clients' array", async () => {
  await check('add', {
    action: {
      id: 100,
      name: 'John',
      type: 'ADD_USER'
    },
    meta: {
      clients: ['1:-lCr7e9s', '2:wv0r_O5C'],
      id: '1487805099387 100:uImkcF4z 0',
      reasons: [],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0',
      time: 1487805099387
    }
  })
})

it("reports actions with metadata containing 'excludeClients' array", async () => {
  await check('add', {
    action: {
      id: 100,
      name: 'John',
      type: 'ADD_USER'
    },
    meta: {
      excludeClients: ['1:-lCr7e9s', '2:wv0r_O5C'],
      id: '1487805099387 100:uImkcF4z 0',
      reasons: [],
      server: 'server:H1f8LAyzl',
      subprotocol: '1.0.0',
      time: 1487805099387
    }
  })
})
