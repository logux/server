let { promisify } = require('util')
let { join } = require('path')
let https = require('https')
let http = require('http')
let fs = require('fs')

let readFile = promisify(fs.readFile)

let BaseServer = require('../base-server')

const DEFAULT_OPTIONS = {
  subprotocol: '0.0.0',
  supports: '0.x'
}
const CERT = join(__dirname, 'fixtures/cert.pem')
const KEY = join(__dirname, 'fixtures/key.pem')

let lastPort = 8111

function createServer (options = { }) {
  for (let i in DEFAULT_OPTIONS) {
    if (typeof options[i] === 'undefined') {
      options[i] = DEFAULT_OPTIONS[i]
    }
  }
  if (typeof options.port === 'undefined') {
    lastPort += 1
    options.port = lastPort
  }
  if (typeof options.controlPort === 'undefined') {
    lastPort += 1
    options.controlPort = lastPort
  }

  let created = new BaseServer(options)
  created.auth(() => true)

  return created
}

function request (method, path) {
  return new Promise((resolve, reject) => {
    let req = http.request({
      method,
      host: 'localhost',
      port: app.options.port,
      path
    }, res => {
      let body = ''
      res.on('data', chunk => {
        body += chunk
      })
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ body, headers: res.headers })
        } else {
          let error = new Error(body)
          error.statusCode = res.statusCode
          reject(error)
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

let app

afterEach(async () => {
  if (app) {
    await app.destroy()
    app = undefined
  }
})

it('uses HTTPS', async () => {
  app = createServer({
    cert: await readFile(CERT),
    key: await readFile(KEY)
  })
  await app.listen()
  expect(app.http instanceof https.Server).toBe(true)
})

it('loads keys by absolute path', async () => {
  app = createServer({
    cert: CERT,
    key: KEY
  })
  await app.listen()
  expect(app.http instanceof https.Server).toBe(true)
})

it('loads keys by relative path', async () => {
  app = createServer({
    root: __dirname,
    cert: 'fixtures/cert.pem',
    key: 'fixtures/key.pem'
  })
  await app.listen()
  expect(app.http instanceof https.Server).toBe(true)
})

it('supports object in SSL key', async () => {
  app = createServer({
    cert: await readFile(CERT),
    key: { pem: await readFile(KEY) }
  })
  await app.listen()
  expect(app.http instanceof https.Server).toBe(true)
})

it('tells about yourself on HTTP request', async () => {
  app = createServer()
  await app.listen()
  let { headers, body } = await request('GET', '/')
  expect(headers['content-type']).toEqual('text/html')
  expect(body).toContain('Logux Server')
})

it('checks HTTP method', async () => {
  app = createServer()
  await app.listen()
  let err
  try {
    await request('PUT', '/')
  } catch (e) {
    err = e
  }
  expect(err.statusCode).toEqual(405)
  expect(err.message).toEqual('Wrong method')
})

it('checks HTTP path', async () => {
  app = createServer()
  await app.listen()
  let err
  try {
    await request('GET', '/admin')
  } catch (e) {
    err = e
  }
  expect(err.statusCode).toEqual(404)
  expect(err.message).toEqual('Not found')
})
