import http from 'node:http'
import { setTimeout } from 'node:timers/promises'
import { afterEach, expect, it } from 'vitest'

import { BaseServer, type BaseServerOptions } from '../index.js'

let lastPort = 10111
function createServer(opts: Partial<BaseServerOptions> = {}): BaseServer {
  lastPort += 1
  let server = new BaseServer({
    port: lastPort,
    subprotocol: '0.0.0',
    supports: '0.x',
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
  app: BaseServer
  names: string[]
  reports: [string, object][]
} {
  let names: string[] = []
  let reports: [string, object][] = []

  app = createServer(opts)
  app.on('report', (name: string, details?: any) => {
    names.push(name)
    reports.push([name, details])
  })
  return { app, names, reports }
}

function request(method: 'GET', path: string): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let req = http.request(
      {
        host: '127.0.0.1',
        method,
        path,
        port: app.options.port
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
  app = createServer()
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

it('responses 405', async () => {
  app = createServer()
  app.controls['POST /test'] = {
    request: () => ({ body: 'done' })
  }
  await app.listen()
  let err = await requestError('GET', '/test')
  expect(err.statusCode).toEqual(405)
  expect(err.message).toEqual('Wrong method')
})

it('supports wrong URL encoding', async () => {
  app = createServer()
  app.controls['GET /test'] = {
    request: () => ({ body: 'done' })
  }
  await app.listen()
  let response = await request('GET', '/test%3Fsecret')

  expect(response.body).toContain('done')
})

it('passes headers', async () => {
  app = createServer()
  app.controls['GET /test'] = {
    request: () => ({
      body: 'done',
      headers: {
        'Content-Type': 'text/plain'
      }
    })
  }
  await app.listen()
  let response = await request('GET', '/test%3Fsecret')

  expect(response.headers['content-type']).toContain('text/plain')
})

it('supports promise', async () => {
  app = createServer()
  app.controls['GET /test'] = {
    async request() {
      return { body: 'done' }
    }
  }
  await app.listen()
  let response = await request('GET', '/test%3Fsecret')

  expect(response.body).toContain('done')
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
