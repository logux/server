let http = require('http')

let BaseServer = require('../base-server')

let lastPort = 8111
function createServer () {
  lastPort += 2
  let server = new BaseServer({
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

it('has health check', () => {
  app = createServer()
  return app.listen().then(() => {
    return request('GET', '/status')
  }).then(response => {
    expect(response).toEqual('OK')
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

it('response 404', () => {
  app = createServer()
  return app.listen().then(() => {
    return request('GET', '/unknown')
  }).catch(err => {
    expect(err.statusCode).toEqual(404)
    expect(err.message).toEqual('Wrong path')
  })
})
