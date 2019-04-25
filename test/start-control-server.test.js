let delay = require('nanodelay')
let http = require('http')

let BaseServer = require('../base-server')

let lastPort = 10111
function createServer (controlPassword) {
  lastPort += 2
  let server = new BaseServer({
    controlPassword,
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
  try {
    await request('POST', '/status')
  } catch (err) {
    expect(err.statusCode).toEqual(405)
    expect(err.message).toEqual('Wrong method')
  }
})

it('responses 404', async () => {
  app = createServer()
  await app.listen()
  try {
    await request('GET', '/unknown')
  } catch (err) {
    expect(err.statusCode).toEqual(404)
    expect(err.message).toEqual('Wrong path')
  }
})

it('checks password', async () => {
  app = createServer('secret')
  app.controls['/test'] = {
    request: () => ({ body: 'done' })
  }
  try {
    await app.listen()
    let response = await request('GET', '/test%3Fsecret')

    expect(response.body).toContain('done')
    await request('GET', '/test?wrong')
  } catch (error) {
    expect(error.statusCode).toEqual(403)
    expect(error.message).toEqual('Wrong password')
  }
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

it('shows error on missed password', async () => {
  app = createServer(undefined)
  app.controls['/test'] = {
    request: () => ({ body: 'done' })
  }
  try {
    await app.listen()
    await request('GET', '/test?secret')
  } catch (error) {
    expect(error.statusCode).toEqual(403)
    expect(error.message).toContain('controlPassword')
  }
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
  try {
    await request('GET', '/test?wrong')
  } catch (error) {
    expect(error.statusCode).toEqual(403)
  }

  try {
    await request('GET', '/test?wrong')
  } catch (error) {
    expect(error.statusCode).toEqual(403)
  }
  try {
    await request('GET', '/test?wrong')
  } catch (error) {
    expect(error.statusCode).toEqual(403)
  }
  try {
    await request('GET', '/test?wrong')
  } catch (error) {
    expect(error.statusCode).toEqual(429)
  }
  await delay(3050)
  try {
    await request('GET', '/test?wrong')
  } catch (error) {
    expect(error.statusCode).toEqual(403)
  }
})
