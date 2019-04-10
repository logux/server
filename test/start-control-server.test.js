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

afterEach(() => {
  return app.destroy().then(() => {
    app = undefined
  })
})

it('has health check', () => {
  app = createServer()
  return app.listen().then(() => {
    return request('GET', '/status')
  }).then(response => {
    expect(response.body).toEqual('OK')
  })
})

it('expects GET for health check', () => {
  app = createServer()
  return app.listen().then(() => {
    return request('POST', '/status')
  }).catch(err => {
    expect(err.statusCode).toEqual(405)
    expect(err.message).toEqual('Wrong method')
  })
})

it('responses 404', () => {
  app = createServer()
  return app.listen().then(() => {
    return request('GET', '/unknown')
  }).catch(err => {
    expect(err.statusCode).toEqual(404)
    expect(err.message).toEqual('Wrong path')
  })
})

it('checks password', () => {
  app = createServer('secret')
  app.controls['/test'] = {
    request: () => ({ body: 'done' })
  }
  return app.listen().then(() => {
    return request('GET', '/test%3Fsecret')
  }).then(response => {
    expect(response.body).toContain('done')
    return request('GET', '/test?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
    expect(error.message).toEqual('Wrong password')
  })
})

it('supports wrong URL encoding', () => {
  app = createServer('secret')
  app.controls['/test'] = {
    request: () => ({ body: 'done' })
  }
  return app.listen().then(() => {
    return request('GET', '/test%3Fsecret')
  }).then(response => {
    expect(response.body).toContain('done')
  })
})

it('shows error on missed password', () => {
  app = createServer(undefined)
  app.controls['/test'] = {
    request: () => ({ body: 'done' })
  }
  return app.listen().then(() => {
    return request('GET', '/test?secret')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
    expect(error.message).toContain('controlPassword')
  })
})

it('passes headers', () => {
  app = createServer('secret')
  app.controls['/test'] = {
    request: () => ({
      headers: {
        'Content-Type': 'text/plain'
      },
      body: 'done'
    })
  }
  return app.listen().then(() => {
    return request('GET', '/test%3Fsecret')
  }).then(response => {
    expect(response.headers['content-type']).toContain('text/plain')
  })
})

it('has bruteforce protection', () => {
  app = createServer('secret')
  app.controls['/test'] = {
    request: () => ({ body: 'done' })
  }
  return app.listen().then(() => {
    return request('GET', '/test?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
    return request('GET', '/test?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
    return request('GET', '/test?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
    return request('GET', '/test?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(429)
  }).then(() => {
    return delay(3050)
  }).then(() => {
    return request('GET', '/test?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
  })
})
