let TestTime = require('logux-core').TestTime
let http = require('http')

let BaseServer = require('../base-server')

const DEFAULT_OPTIONS = {
  subprotocol: '0.0.0',
  supports: '0.x'
}

let lastPort = 9111
function createServer (options) {
  if (!options) options = { }
  for (let i in DEFAULT_OPTIONS) {
    if (typeof options[i] === 'undefined') {
      options[i] = DEFAULT_OPTIONS[i]
    }
  }
  options.time = new TestTime()
  options.id = 'uuid'
  lastPort += 2
  options.port = lastPort - 1
  options.controlPort = lastPort

  let created = new BaseServer(options)
  created.auth(() => true)

  return created
}

function request (method, path) {
  return new Promise((resolve, reject) => {
    let req = http.request({
      method,
      host: 'localhost',
      port: app.options.controlPort,
      path
    }, res => {
      let answer = ''
      res.on('data', chunk => {
        answer += chunk
      })
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(answer)
        } else {
          let error = new Error(answer)
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
