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

it('supports wrong URL encoding', () => {
  app = createServer('secret')
  return app.listen().then(() => {
    return request('GET', '/prometheus%3Fsecret')
  }).then(response => {
    expect(response).toContain('nodejs_heap_size_total_bytes ')
  })
})

it('reports internal things', () => {
  app = createServer('secret')
  return app.listen().then(() => {
    app.connected.one = { destroy: () => true }
    app.connected.two = { destroy: () => true }
    app.emitter.emit('connected', { })
    app.emitter.emit('connected', { })
    app.emitter.emit('authenticated', 50)
    app.log.emitter.emit('add', { type: 'FOO' }, { })
    app.emitter.emit('processed', { type: 'FOO' }, { }, 50)
    app.emitter.emit('subscribed', { }, { }, 5)
    app.emitter.emit('subscriptionCancelled')
    app.emitter.emit('backendGranted', { }, { }, 100)
    app.emitter.emit('backendProcessed', { }, { }, 115)
    app.emitter.emit('error', { name: 'LoguxError', type: 'a' })
    app.emitter.emit('error', { name: 'Error' })
    app.emitter.emit('clientError', { })
    delete app.connected.two
    app.emitter.emit('disconnected', { })
    return request('GET', '/prometheus?secret')
  }).then(res => {
    expect(res).toContain('logux_clients_gauge 1')
    expect(res).toContain('logux_errors_counter 1')
    expect(res).toContain('logux_errors_counter{name="LoguxError: a"} 1')
    expect(res).toContain('logux_errors_counter{name="Error"} 1')
    expect(res).toContain('logux_request_counter{type="FOO"} 1')
    expect(res).toContain('logux_request_processing_time_histogram_sum 50')
    expect(res).toContain('logux_subscription_counter 1')
    expect(res).toContain('logux_subscription_cancel_counter 1')
    expect(res).toContain('logux_subscription_processing_time_histogram_sum 5')
    expect(res).toContain('logux_auth_processing_time_histogram_sum 50')
    expect(res).toContain('logux_backend_access_time_histogram_sum 100')
    expect(res).toContain('logux_backend_responce_time_histogram_sum 115')
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
