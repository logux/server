import { LoguxError } from '@logux/core'
import { expect, it } from 'vitest'

import { createReporter } from './index.js'

class MemoryStream {
  flushSync: ((chunk: string) => void) | undefined

  string: string

  constructor(flushSync: boolean) {
    this.string = ''
    if (flushSync) {
      this.flushSync = chunk => {
        this.string += chunk + 'FLUSH'
      }
    }
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
  let json = new MemoryStream(true)
  let jsonReporter = createReporter({
    logger: {
      stream: json,
      type: 'json'
    }
  })
  jsonReporter(type, details)
  expect(clean(json.string)).toMatchSnapshot()

  let human = new MemoryStream(false)
  let humanReporter = createReporter({
    logger: {
      color: true,
      stream: human,
      type: 'human'
    }
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

it('reports listen', () => {
  check('listen', {
    cert: false,
    environment: 'development',
    host: '127.0.0.1',
    loguxServer: '0.0.0',
    minSubprotocol: 0,
    nodeId: 'server:FnXaqDxY',
    notes: {},
    port: 31337,
    redis: undefined,
    server: false,
    subprotocol: 0
  })
})

it('reports listen for production', () => {
  check('listen', {
    cert: true,
    environment: 'production',
    host: '127.0.0.1',
    loguxServer: '0.0.0',
    minSubprotocol: 0,
    nodeId: 'server:FnXaqDxY',
    notes: {},
    port: 31337,
    redis: '//localhost',
    server: false,
    subprotocol: 0
  })
})

it('reports listen for custom domain', () => {
  check('listen', {
    environment: 'development',
    loguxServer: '0.0.0',
    minSubprotocol: 0,
    nodeId: 'server:FnXaqDxY',
    notes: {
      prometheus: 'http://127.0.0.1:31338/prometheus'
    },
    server: true,
    subprotocol: 0
  })
})

it('reports connect', () => {
  check('connect', { connectionId: '670', ipAddress: '10.110.6.56' })
})

it('reports authenticated', () => {
  check('authenticated', {
    connectionId: '670',
    nodeId: 'admin:100:uImkcF4z',
    subprotocol: 1
  })
})

it('reports authenticated without user ID', () => {
  check('authenticated', {
    connectionId: '670',
    nodeId: 'uImkcF4z',
    subprotocol: 1
  })
})

it('reports unauthenticated', () => {
  check('unauthenticated', {
    connectionId: '670',
    nodeId: '100:uImkcF4z',
    subprotocol: 1
  })
})

it('reports add', () => {
  check('add', {
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
      subprotocol: 1,
      time: 1487805099387
    }
  })
})

it('reports add and clean', () => {
  check('addClean', {
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
      subprotocol: 1,
      time: 1487805099387
    }
  })
})

it('throws on circuital reference', () => {
  let a: { b: any } = { b: undefined }
  let b: { a: any } = { a: undefined }
  a.b = b
  b.a = a
  expect(() => {
    check('add', {
      action: { a, type: 'CHANGE_USER' },
      meta: {
        id: '1487805099387 100:uImkcF4z 0',
        reasons: ['lastValue', 'debug'],
        server: 'server:H1f8LAyzl',
        subprotocol: 1,
        time: 1487805099387
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
    actionId: '1487805099387 100:vAApgNT9 0',
    type: 'CHANGE_SER'
  })
})

it('reports unknownType from server', () => {
  check('unknownType', {
    actionId: '1650269021700 server:FnXaqDxY 0',
    type: 'CHANGE_SER'
  })
})

it('reports wrongChannel', () => {
  check('wrongChannel', {
    actionId: '1650269045800 100:IsvVzqWx 0',
    channel: 'ser/100'
  })
})

it('reports wrongChannel without name', () => {
  check('wrongChannel', {
    actionId: '1650269056600 100:uImkcF4z 0',
    channel: undefined
  })
})

it('reports subscribed', () => {
  check('subscribed', {
    actionId: '1487805099387 100:uImkcF4z 0',
    channel: 'user/100'
  })
})

it('reports unsubscribed', () => {
  check('unsubscribed', {
    actionId: '1650271940900 100:uImkcF4z 0',
    channel: 'user/100'
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

it('reports destroy', () => {
  check('destroy')
})

it('reports EACCES error', () => {
  check('error', { err: { code: 'EACCES', port: 80 }, fatal: true })
})

it('reports EADDRINUSE error', () => {
  check('error', {
    err: { code: 'EADDRINUSE', port: 31337 },
    fatal: true
  })
})

it('reports Logux error', () => {
  let err = {
    logux: true,
    message: 'Unknown option `suprotocol` in server constructor',
    note:
      'Maybe there is a mistake in option name or this version ' +
      'of Logux Server doesn’t support this option'
  }
  check('error', { err, fatal: true })
})

it('reports error', () => {
  check('error', {
    err: createError('Error', 'Some mistake'),
    fatal: true
  })
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
  check('clientError', { err, nodeId: '100:uImkcF4z' })
})

it('reports useless actions', () => {
  check('useless', {
    action: {
      id: 100,
      name: 'John',
      type: 'ADD_USER'
    },
    meta: {
      id: '1487805099387 100:uImkcF4z 0',
      reasons: [],
      server: 'server:H1f8LAyzl',
      subprotocol: 1,
      time: 1487805099387
    }
  })
})

it("reports actions with metadata containing 'clients' array", () => {
  check('add', {
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
      subprotocol: 1,
      time: 1487805099387
    }
  })
})

it('reports actions with excludeClients metadata', () => {
  check('add', {
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
      subprotocol: 1,
      time: 1487805099387
    }
  })
})

it('allows custom loggers', () => {
  let text = new MemoryStream(false)
  let jsonReporter = createReporter({
    logger: {
      info(details: object, msg: string) {
        text.write(JSON.stringify({ details, msg }))
      }
    }
  })
  jsonReporter('connect', { connectionId: '670', ipAddress: '10.110.6.56' })
  expect(clean(text.string)).toMatchSnapshot()
})
