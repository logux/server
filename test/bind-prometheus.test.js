let delay = require('nanodelay')
let http = require('http')

let BaseServer = require('../base-server')

let lastPort = 7111
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
      let response = ''
      res.on('data', chunk => {
        response += chunk
      })
      res.on('end', () => {
        if (res.statusCode === 200) {
          expect(res.headers['content-type']).toContain('text/plain')
          resolve(response)
        } else {
          let error = new Error(response)
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

it('has prometheus report', () => {
  app = createServer('secret')
  return app.listen().then(() => {
    return request('GET', '/prometheus?secret')
  }).then(response => {
    expect(response).toContain('nodejs_heap_size_total_bytes ')
  })
})

it('reports internal things', () => {
  app = createServer('secret')
  return app.listen().then(() => {
    app.emitter.emit('connected', { })
    app.emitter.emit('connected', { })
    app.emitter.emit('processed', { }, { }, 50)
    app.emitter.emit('processed', { }, { }, undefined)
    app.emitter.emit('clientError', { })
    app.emitter.emit('disconnected', { })
    return request('GET', '/prometheus?secret')
  }).then(response => {
    expect(response).toContain('logux_clients_gauge 1')
    expect(response).toContain('logux_client_errors_counter 1')
    expect(response).toContain('logux_request_processing_time_histogram_sum 50')
  })
})

it('checks password', () => {
  app = createServer('secret')
  return app.listen().then(() => {
    return request('GET', '/prometheus?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
    expect(error.message).toEqual('Wrong password')
  })
})

it('shows error on missed password', () => {
  app = createServer(undefined)
  return app.listen().then(() => {
    return request('GET', '/prometheus?secret')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
    expect(error.message).toContain('controlPassword')
  })
})

it('has bruteforce protection', () => {
  app = createServer('secret')
  return app.listen().then(() => {
    return request('GET', '/prometheus?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
    return request('GET', '/prometheus?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
    return request('GET', '/prometheus?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
    return request('GET', '/prometheus?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(429)
  }).then(() => {
    return delay(3050)
  }).then(() => {
    return request('GET', '/prometheus?wrong')
  }).catch(error => {
    expect(error.statusCode).toEqual(403)
  })
})
