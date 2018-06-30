const https = require('https')
const http = require('http')
const url = require('url')

const VERSION = 0
const MIN_VERSION = 0

const PROCESSED = /^\[\s*\[\s*"processed"/
const REJECTED = /^\[\s*\[\s*"rejected"/

function isValid (data) {
  if (typeof data !== 'object') return false
  if (typeof data.version !== 'number') return false
  if (data.version > MIN_VERSION) return false
  if (typeof data.password !== 'string') return false
  if (!Array.isArray(data.commands)) return false
  for (const command of data.commands) {
    if (!Array.isArray(command)) return false
    if (command[0] !== 'action') return false
    if (typeof command[1] !== 'object') return false
    if (typeof command[2] !== 'object') return false
  }
  return true
}

function send (backend, password, action, meta) {
  const body = JSON.stringify({
    version: VERSION,
    password,
    commands: [['action', action, meta]]
  })
  const protocol = backend.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = protocol.request({
      method: 'POST',
      host: backend.hostname,
      port: backend.port,
      path: backend.path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let received = ''
      let processed = false
      res.on('data', part => {
        if (!processed) {
          received += part
          if (PROCESSED.test(received)) {
            processed = true
            resolve(true)
          } else if (REJECTED.test(received)) {
            processed = true
            resolve(false)
          }
        }
      })
    })
    req.on('error', reject)
    req.end(body)
  })
}

function createBackendProxy (server, options) {
  if (!options.password) {
    throw new Error(
      'For security reasons you must set strong password ' +
      'in `backend.password` option'
    )
  }
  if (!options.url) {
    throw new Error('You must set `backend.url` option with address to backend')
  }

  const backend = url.parse(options.url)

  server.otherType({
    access (action, meta) {
      return send(backend, options.password, action, meta)
    }
  })

  server.otherChannel({
    access (param, action, meta) {
      return send(backend, options.password, action, meta)
    }
  })

  const httpServer = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    if (req.url !== '/') {
      res.statusCode = 404
      res.end()
      return
    }

    let body = ''
    req.on('data', data => {
      body += data
    })
    req.on('end', () => {
      let data
      try {
        data = JSON.parse(body)
      } catch (e) {
        res.statusCode = 400
        res.end()
        return
      }
      if (!isValid(data)) {
        res.statusCode = 400
        res.end()
        return
      }
      if (data.password !== options.password) {
        res.statusCode = 403
        res.end()
        return
      }
      Promise.all(data.commands.map(command => {
        return server.log.add(command[1], command[2])
      })).then(() => {
        res.end()
      })
    })
  })

  server.unbind.push(() => {
    return new Promise(resolve => {
      httpServer.close(resolve)
    })
  })

  return httpServer
}

module.exports = createBackendProxy
