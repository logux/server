let nanoid = require('nanoid')
let https = require('https')
let http = require('http')
let url = require('url')

const VERSION = 0

const AUTHENTICATED = /^\[\s*\[\s*"authenticated"/
const FORBIDDEN = /^\[\s*\[\s*"forbidden"/
const APPROVED = /^\[\s*\[\s*"approved"/
const DENIED = /^\[\s*\[\s*"denied"/
const ERROR = /^\[\s*\[\s*"error"/

function parseAnswer (str) {
  let json
  try {
    json = JSON.parse(str)
  } catch (e) {
    return false
  }
  let answered = false
  for (let command of json) {
    if (!Array.isArray(command)) return false
    if (typeof command[0] !== 'string') return false
    if (command[0] === 'processed' || command[0] === 'error') answered = true
  }
  if (!answered) return false
  return json
}

function send (backend, command, chulkCallback, endCallback) {
  let body = JSON.stringify({
    version: VERSION,
    password: backend.password,
    commands: [command]
  })
  let protocol = backend.protocol === 'https:' ? https : http
  let resolved = false
  let errored = false

  return new Promise((resolve, reject) => {
    let req = protocol.request({
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
      if (res.statusCode < 200 || res.statusCode > 299) {
        errored = true
        reject(new Error(`Backend responsed with ${ res.statusCode } code`))
      } else {
        res.on('data', part => {
          received += part
          if (!resolved) {
            if (ERROR.test(received)) {
              errored = true
              reject(new Error('Backend error'))
            } else {
              let result = chulkCallback(received)
              if (typeof result !== 'undefined') {
                resolved = true
                resolve(result)
              }
            }
          }
        })
        res.on('end', () => {
          if (!errored && resolved) {
            if (endCallback) endCallback(received)
          } else if (!errored) {
            reject(new Error('Backend wrong answer'))
          }
        })
      }
    })
    req.on('error', reject)
    req.end(body)
  })
}

function bindBackendProxy (app) {
  if (!app.options.controlPassword) {
    let e = new Error('`backend` requires also `controlPassword` option')
    e.code = 'LOGUX_NO_CONTROL_PASSWORD'
    throw e
  }

  /* eslint-disable-next-line node/no-deprecated-api */
  let backend = url.parse(app.options.backend)
  backend.password = app.options.controlPassword

  let processing = { }

  function access (ctx, action, meta) {
    let processResolve, processReject
    processing[meta.id] = new Promise((resolve, reject) => {
      processResolve = resolve
      processReject = reject
    })

    return send(backend, ['action', action, meta], received => {
      if (APPROVED.test(received)) {
        return true
      } else if (FORBIDDEN.test(received)) {
        delete processing[meta.id]
        return false
      } else {
        return undefined
      }
    }, response => {
      if (processing[meta.id]) {
        let json = parseAnswer(response)
        if (!json) {
          processReject(new Error('Backend wrong answer'))
        } else if (json.some(i => i[0] === 'processed')) {
          processResolve()
        } else {
          processReject(new Error('Backend error during processing'))
        }
      }
    }).catch(e => {
      delete processing[meta.id]
      throw e
    })
  }

  function process (ctx, action, meta) {
    return processing[meta.id].then(() => {
      delete processing[meta.id]
    }, e => {
      delete processing[meta.id]
      throw e
    })
  }

  app.auth((userId, credentials) => {
    return send(backend, ['auth', userId, credentials, nanoid()], received => {
      if (AUTHENTICATED.test(received)) {
        return true
      } else if (DENIED.test(received)) {
        return false
      } else {
        return undefined
      }
    })
  })
  app.otherType({ access, process })
  app.otherChannel({ access, init: process })

  app.controls['/'] = {
    isValid (command) {
      return command.length === 3 &&
        command[0] === 'action' &&
        typeof command[1] === 'object' &&
        typeof command[2] === 'object' &&
        typeof command[1].type === 'string'
    },
    command (command, req) {
      if (!app.types[command[1].type]) {
        command[2].status = 'processed'
      }
      command[2].backend = req.connection.remoteAddress
      return app.log.add(command[1], command[2])
    }
  }
}

module.exports = bindBackendProxy
