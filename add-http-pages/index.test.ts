import { type TestLog, TestTime } from '@logux/core'
import http from 'node:http'
import { setTimeout } from 'node:timers/promises'
import { afterEach, expect, it } from 'vitest'

import {
  BaseServer,
  type BaseServerOptions,
  type ServerMeta
} from '../index.js'

const DEFAULT_OPTIONS = {
  minSubprotocol: 0,
  subprotocol: 0
}

let lastPort = 9111

async function until(check: () => unknown): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (check()) return
    await setTimeout(10)
  }
  throw new Error('Timeout of the waiting')
}

function createServer(
  options: Partial<BaseServerOptions> = {}
): BaseServer<object, TestLog<ServerMeta>> {
  let opts = {
    ...DEFAULT_OPTIONS,
    ...options
  }
  if (typeof opts.time === 'undefined') {
    opts.time = new TestTime()
    opts.id = 'uuid'
  }
  if (typeof opts.port === 'undefined') {
    lastPort += 1
    opts.port = lastPort
  }

  let created = new BaseServer<object, TestLog<ServerMeta>>(opts)
  created.auth(() => true)

  destroyable = created

  return created
}

let destroyable: BaseServer | undefined

class RequestError extends Error {
  statusCode: number | undefined

  constructor(statusCode: number | undefined, body: string) {
    super(body)
    this.name = 'RequestError'
    this.statusCode = statusCode
  }
}

interface HttpResponse {
  body: string
  headers: http.IncomingHttpHeaders
}

function request(
  server: BaseServer,
  method: string,
  path: string
): Promise<HttpResponse> {
  return new Promise<HttpResponse>((resolve, reject) => {
    let req = http.request(
      {
        host: '127.0.0.1',
        method,
        path,
        port: server.options.port
      },
      res => {
        let body = ''
        res.on('data', chunk => {
          body += chunk
        })
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ body, headers: res.headers })
          } else {
            let error = new RequestError(res.statusCode, body)
            reject(error)
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function requestError(
  server: BaseServer,
  method: string,
  path: string
): Promise<RequestError> {
  try {
    await request(server, method, path)
  } catch (e) {
    if (e instanceof RequestError) return e
  }
  throw new Error('Error was not found')
}

afterEach(async () => {
  if (destroyable) {
    await destroyable.destroy()
    destroyable = undefined
  }
})

it('has hello page', async () => {
  let app = createServer({})
  await app.listen()
  let response = await request(app, 'GET', '/')
  expect(response.body).toContain('Logux Server')
  expect(response.body).toContain('<svg ')
})

it('disables HTTP on request', async () => {
  let app = createServer({ disableHttpServer: true })
  await app.listen()
  let response = false
  let req = http.request(
    {
      host: '127.0.0.1',
      method: 'GET',
      path: '/health',
      port: app.options.port
    },
    () => {
      response = true
    }
  )
  req.on('error', () => {})
  await setTimeout(100)
  expect(response).toBe(false)
  req.destroy()
})

it('has health check', async () => {
  let app = createServer()
  await app.listen()
  let response = await request(app, 'GET', '/health')
  expect(response.body).toContain('OK')
})

it('responses 404', async () => {
  let app = createServer()
  await app.listen()
  let err = await requestError(app, 'GET', '/unknown')
  expect(err.statusCode).toEqual(404)
  expect(err.message).toEqual('Not found\n')
})

it('has custom HTTP processor', async () => {
  let app = createServer()
  let unknownGet = 0
  let unknownRest = 0
  app.http('POST', '/a', (req, res) => {
    res.end('POST a')
  })
  app.http('GET', '/a', (req, res) => {
    res.end('GET a')
  })
  app.http('GET', '/b', (req, res) => {
    res.end('GET b')
  })
  app.http((req, res) => {
    if (req.method === 'GET') {
      res.end('GET unknown')
      unknownGet += 1
      return true
    } else {
      return false
    }
  })
  app.http((req, res) => {
    if (req.url !== '/404') {
      res.end('unknown')
      unknownRest += 1
      return true
    } else {
      return false
    }
  })
  await app.listen()
  expect((await request(app, 'GET', '/a')).body).toContain('GET a')
  expect((await request(app, 'GET', '/a%3Fsecret')).body).toContain('GET a')
  expect((await request(app, 'GET', '/b')).body).toContain('GET b')
  expect((await request(app, 'POST', '/a')).body).toContain('POST a')
  expect((await request(app, 'GET', '/c')).body).toContain('GET unknown')
  expect((await request(app, 'GET', '/d')).body).toContain('GET unknown')
  expect((await request(app, 'POST', '/e')).body).toContain('unknown')
  expect((await requestError(app, 'POST', '/404')).statusCode).toEqual(404)
  expect(unknownGet).toEqual(2)
  expect(unknownRest).toEqual(1)
})

it('supports `*` in HTTP processor URL', async () => {
  let app = createServer()
  app.http('GET', '/proxy/keep', (req, res) => {
    res.end('exact')
  })
  app.http('GET', '/proxy/*', (req, res) => {
    res.end(`proxy ${req.url}`)
  })
  app.http('GET', '/files/*/meta', (req, res) => {
    res.end('meta')
  })
  await app.listen()

  expect((await request(app, 'GET', '/proxy/a')).body).toEqual('proxy /proxy/a')
  expect((await request(app, 'GET', '/proxy/a/b')).body).toEqual(
    'proxy /proxy/a/b'
  )
  expect((await request(app, 'GET', '/proxy/a?b=1')).body).toEqual(
    'proxy /proxy/a?b=1'
  )
  expect((await request(app, 'GET', '/files/a/b/meta')).body).toEqual('meta')
  expect((await request(app, 'GET', '/proxy/keep')).body).toEqual('exact')

  expect((await requestError(app, 'GET', '/proxy')).statusCode).toEqual(404)
  expect((await requestError(app, 'POST', '/proxy/a')).statusCode).toEqual(404)
  expect((await requestError(app, 'GET', '/other/a')).statusCode).toEqual(404)
})

it('checks listeners in the order they were added', async () => {
  let app = createServer()
  app.http('GET', '/a/*', (req, res) => {
    res.end('first')
  })
  app.http('GET', '/*', (req, res) => {
    res.end('second')
  })
  await app.listen()

  expect((await request(app, 'GET', '/a/1')).body).toEqual('first')
  expect((await request(app, 'GET', '/b/1')).body).toEqual('second')
  // The built-in pages were added before the patterns
  expect((await request(app, 'GET', '/health')).body).toContain('OK')
})

it('replaces the listener with the same method and URL', async () => {
  let app = createServer()
  app.http('GET', '/a', (req, res) => {
    res.end('first')
  })
  app.http('GET', '/a', (req, res) => {
    res.end('second')
  })
  app.http('GET', '/health', (req, res) => {
    res.end('custom health')
  })
  await app.listen()

  expect((await request(app, 'GET', '/a')).body).toEqual('second')
  expect((await request(app, 'GET', '/health')).body).toEqual('custom health')
})

it('allows to replace 404 answer', async () => {
  let app = createServer()
  let unknown = 0
  app.http('GET', '/a', (req, res) => {
    res.end('a')
  })
  app.http(() => {
    unknown += 1
    return false
  })
  app.httpNotFound((req, res) => {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(`{"error":"Unknown ${req.method} ${req.url}"}`)
  })
  await app.listen()

  expect((await request(app, 'GET', '/a')).body).toEqual('a')
  expect(unknown).toEqual(0)

  let err = await requestError(app, 'POST', '/b')
  expect(err.statusCode).toEqual(404)
  expect(err.message).toEqual('{"error":"Unknown POST /b"}')
  expect(unknown).toEqual(1)
})

it('does not call 404 processor on processed request', async () => {
  let app = createServer()
  let notFound = 0
  app.http((req, res) => {
    res.end('all')
    return true
  })
  app.httpNotFound((req, res) => {
    notFound += 1
    res.writeHead(404)
    res.end()
  })
  await app.listen()

  expect((await request(app, 'GET', '/b')).body).toEqual('all')
  expect(notFound).toEqual(0)
})

it('warns that HTTP is disables', () => {
  let app = createServer({ disableHttpServer: true })
  expect(() => {
    app.http(() => true)
  }).toThrow(/when `disableHttpServer` enabled/)
  expect(() => {
    app.httpNotFound(() => {})
  }).toThrow(/when `disableHttpServer` enabled/)
})

it('waits until all HTTP processing ends', async () => {
  let app = createServer()
  let resolveA: (() => void) | undefined
  app.http('GET', '/a', () => {
    return new Promise(resolve => {
      resolveA = resolve
    })
  })
  let resolveResult: ((processed: boolean) => void) | undefined
  app.http(() => {
    return new Promise(resolve => {
      resolveResult = resolve
    })
  })
  await app.listen()

  request(app, 'GET', '/a')
  request(app, 'GET', '/other')
  await until(() => resolveA && resolveResult)

  let destroyed = false
  app.destroy().then(() => {
    destroyed = true
  })

  await setTimeout(100)
  expect(destroyed).toBe(false)

  expect((await requestError(app, 'POST', '/a')).message).toEqual(
    'The server is shutting down\n'
  )

  resolveA!()
  await setTimeout(100)
  expect(destroyed).toBe(false)

  resolveResult!(true)
  await until(() => destroyed)
  expect(destroyed).toBe(true)
})
