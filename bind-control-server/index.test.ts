import { ClientNode, Log, MemoryStore, WsConnection } from '@logux/core'
import { delay } from 'nanodelay'
import WebSocket from 'ws'
import http from 'http'

import { BaseServer, BaseServerOptions } from '../index.js'

let lastPort = 10111
function createServer(opts: Partial<BaseServerOptions> = {}): BaseServer {
  lastPort += 1
  let server = new BaseServer({
    subprotocol: '0.0.0',
    supports: '0.x',
    port: lastPort,
    ...opts
  })
  server.auth(() => true)
  return server
}

class RequestError extends Error {
  statusCode: number | undefined

  constructor(statusCode: number | undefined, body: string) {
    super(body)
    this.name = 'RequestError'
    this.statusCode = statusCode
  }
}

type Response = {
  body: string
  headers: http.IncomingHttpHeaders
}

let app: BaseServer

afterEach(async () => {
  await app.destroy()
})

function createReporter(opts: Partial<BaseServerOptions> = {}): {
  names: string[]
  reports: [string, object][]
  app: BaseServer
} {
  let names: string[] = []
  let reports: [string, object][] = []

  app = createServer(opts)
  app.on('report', (name: string, details?: any) => {
    names.push(name)
    reports.push([name, details])
  })
  return { names, reports, app }
}

function request(method: 'GET', path: string): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let req = http.request(
      {
        method,
        host: '127.0.0.1',
        port: app.options.port,
        path
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
  method: 'GET',
  path: string
): Promise<RequestError> {
  try {
    await request(method, path)
  } catch (e) {
    if (e instanceof RequestError) return e
  }
  throw new Error('Error was not found')
}

it('has hello page', async () => {
  app = createServer({})
  await app.listen()
  let response = await request('GET', '/')
  expect(response.body).toContain('Logux Server')
  expect(response.body).toContain('<svg ')
})

it('disables HTTP on request', async () => {
  app = createServer({ disableHttpServer: true })
  await app.listen()
  let response = false
  let req = http.request(
    {
      method: 'GET',
      host: '127.0.0.1',
      port: app.options.port,
      path: '/health'
    },
    () => {
      response = true
    }
  )
  req.on('error', () => {})
  await delay(100)
  expect(response).toBe(false)
  req.destroy()
})

it('has health check', async () => {
  app = createServer()
  await app.listen()
  let response = await request('GET', '/health')
  expect(response.body).toContain('OK')
})

it('has health check with control server', async () => {
  app = createServer({ controlSecret: 'secret', backend: 'http://localhost/' })
  await app.listen()
  let response = await request('GET', '/health')
  expect(response.body).toContain('OK')
})

it('does not apply control mask to health check', async () => {
  app = createServer({ controlMask: '8.8.8.8/32' })
  await app.listen()
  let response = await request('GET', '/health')
  expect(response.body).toContain('OK')
})

it('responses 404', async () => {
  app = createServer()
  await app.listen()
  let err = await requestError('GET', '/unknown')
  expect(err.statusCode).toEqual(404)
  expect(err.message).toEqual('Wrong path')
})

it('checks secret', async () => {
  let test = createReporter({ controlSecret: 'secret' })
  test.app.controls['GET /test'] = {
    request() {
      return { body: 'done' }
    }
  }
  await test.app.listen()

  let response = await request('GET', '/test%3Fsecret')
  expect(response.body).toContain('done')

  let err = await requestError('GET', '/test?wrong')
  expect(err.statusCode).toEqual(403)
  expect(err.message).toEqual('Wrong secret')

  expect(test.reports[1]).toEqual([
    'wrongControlSecret',
    { ipAddress: '127.0.0.1', wrongSecret: 'wrong' }
  ])
})

it('supports wrong URL encoding', async () => {
  app = createServer({ controlSecret: 'secret' })
  app.controls['GET /test'] = {
    request: () => ({ body: 'done' })
  }
  await app.listen()
  let response = await request('GET', '/test%3Fsecret')

  expect(response.body).toContain('done')
})

it('shows error on missed secret', async () => {
  app = createServer({ controlSecret: undefined })
  app.controls['GET /test'] = {
    request: () => ({ body: 'done' })
  }
  await app.listen()
  let err = await requestError('GET', '/test?secret')
  expect(err.statusCode).toEqual(500)
  expect(err.message).toContain('LOGUX_CONTROL_SECRET')
})

it('passes headers', async () => {
  app = createServer({ controlSecret: 'secret' })
  app.controls['GET /test'] = {
    request: () => ({
      headers: {
        'Content-Type': 'text/plain'
      },
      body: 'done'
    })
  }
  await app.listen()
  let response = await request('GET', '/test%3Fsecret')

  expect(response.headers['content-type']).toContain('text/plain')
})

it('supports promise', async () => {
  app = createServer({ controlSecret: 'secret' })
  app.controls['GET /test'] = {
    async request() {
      return { body: 'done' }
    }
  }
  await app.listen()
  let response = await request('GET', '/test%3Fsecret')

  expect(response.body).toContain('done')
})

it('has bruteforce protection', async () => {
  app = createServer({ controlSecret: 'secret' })
  app.controls['GET /test'] = {
    request: () => ({ body: 'done' })
  }
  await app.listen()

  let err1 = await requestError('GET', '/test?wrong')
  expect(err1.statusCode).toEqual(403)

  let err2 = await requestError('GET', '/test?wrong')
  expect(err2.statusCode).toEqual(403)

  let err3 = await requestError('GET', '/test?wrong')
  expect(err3.statusCode).toEqual(403)

  let err4 = await requestError('GET', '/test?wrong')
  expect(err4.statusCode).toEqual(429)

  await delay(3050)

  let err5 = await requestError('GET', '/test?wrong')
  expect(err5.statusCode).toEqual(403)
})

it('does not break WebSocket', async () => {
  app = createServer({
    controlSecret: 'secret',
    controlMask: '128.0.0.1/8, 127.1.0.0/16'
  })
  await app.listen()

  let nodeId = '10:client:node'
  let log = new Log({ store: new MemoryStore(), nodeId })
  let con = new WsConnection(`ws://127.0.0.1:${app.options.port}`, WebSocket)
  let node = new ClientNode(nodeId, log, con)

  node.connection.connect()
  await node.waitFor('synchronized')
})

it('checks incoming IP address', async () => {
  let controlMask = '128.0.0.1/8, 127.1.0.0/16'
  let test = createReporter({ controlMask })
  test.app.controls['GET /test'] = {
    request: () => ({ body: 'done' })
  }
  await test.app.listen()
  let err = await requestError('GET', '/test')

  expect(err.statusCode).toEqual(403)
  expect(err.message).toContain('LOGUX_CONTROL_MASK')
  expect(test.reports[1]).toEqual([
    'wrongControlIp',
    { ipAddress: '127.0.0.1', mask: controlMask }
  ])
})

it('allows to set custom HTTP processor', async () => {
  let test = createReporter()
  test.app.http((req, res) => {
    res.statusCode = 200
    res.end(`test ${req.url}`)
  })
  await test.app.listen()

  let response = await request('GET', '/test')
  expect(response.body).toEqual('test /test')
})

it('does not allow to set custom HTTP processor on disabled HTTP', async () => {
  app = createServer({ disableHttpServer: true })
  expect(() => {
    app.http((req, res) => {
      res.statusCode = 200
      res.end(`test ${req.url}`)
    })
  }).toThrow(/can not be called when `disableHttpServer` enabled/)
})

it('does not allow to have control secret on disabled HTTP', async () => {
  app = createServer({ disableHttpServer: true, controlSecret: 'x' })
  let err: Error | undefined
  try {
    await app.listen()
  } catch (e) {
    if (e instanceof Error) err = e
  }
  expect(err?.message).toBe(
    '`controlSecret` can be set together with `disableHttpServer` option'
  )
})

