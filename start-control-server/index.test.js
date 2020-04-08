let { delay } = require('nanodelay')
let http = require('http')

let BaseServer = require('../base-server')

let lastPort = 10111
function createServer (controlSecret) {
  lastPort += 2
  let server = new BaseServer({
    controlSecret,
    subprotocol: '0.0.0',
    controlPort: lastPort,
    supports: '0.x',
    port: lastPort - 1
  })
  server.auth(() => true)
  return server
}

function request (method, path) {
  return new Promise((resolve, reject) => {
    let req = http.request({
      method,
      host: 'localhost',
      port: app.options.controlPort,
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

async function requestError (method, path) {
  try {
    await request(method, path)
    return false
  } catch (e) {
    return e
  }
}

let app

afterEach(async () => {
  await app.destroy()
  app = undefined
})

it('has health check', async () => {
  app = createServer()
  await app.listen()
  let response = await request('GET', '/status')

  expect(response.body).toEqual('OK')
})

it('expects GET for health check', async () => {
  app = createServer()
  await app.listen()
  let err = await requestError('POST', '/status')
  expect(err.statusCode).toEqual(405)
  expect(err.message).toEqual('Wrong method')
})

it('responses 404', async () => {
  app = createServer()
  await app.listen()
  let err = await requestError('GET', '/unknown')
  expect(err.statusCode).toEqual(404)
  expect(err.message).toEqual('Wrong path')
})

it('checks secret', async () => {
  app = createServer('secret')
  app.controls['/test'] = {
    request: () => ({ body: 'done' })
  }
  await app.listen()

  let response = await request('GET', '/test%3Fsecret')
  expect(response.body).toContain('done')

  let err = await requestError('GET', '/test?wrong')
  expect(err.statusCode).toEqual(403)
  expect(err.message).toEqual('Wrong secret')
})

it('supports wrong URL encoding', async () => {
  app = createServer('secret')
  app.controls['/test'] = {
    request: () => ({ body: 'done' })
  }
  await app.listen()
  let response = await request('GET', '/test%3Fsecret')

  expect(response.body).toContain('done')
})

it('shows error on missed secret', async () => {
  app = createServer(undefined)
  app.controls['/test'] = {
    request: () => ({ body: 'done' })
  }
  await app.listen()
  let err = await requestError('GET', '/test?secret')
  expect(err.statusCode).toEqual(403)
  expect(err.message).toContain('controlSecret')
})

it('passes headers', async () => {
  app = createServer('secret')
  app.controls['/test'] = {
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

it('has bruteforce protection', async () => {
  app = createServer('secret')
  app.controls['/test'] = {
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
