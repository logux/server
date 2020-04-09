let JSONStream = require('JSONStream')
let { nanoid } = require('nanoid')
let https = require('https')
let http = require('http')

const VERSION = 2

function isResendCorrect (data) {
  if (!data || typeof data !== 'object') return false
  for (let i in data) {
    if (!Array.isArray(data[i])) return false
    if (data[i].some(j => typeof j !== 'string')) return false
  }
  return true
}

function send (backend, command, events) {
  let body = JSON.stringify({
    version: VERSION,
    commands: [command],
    secret: backend.secret
  })
  let protocol = backend.protocol === 'https:' ? https : http
  let req = protocol.request({
    method: 'POST',
    host: backend.hostname,
    port: backend.port,
    path: backend.pathname + backend.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, res => {
    if (res.statusCode < 200 || res.statusCode > 299) {
      events.error(new Error(`Backend responsed with ${ res.statusCode } code`))
    } else {
      let data = false
      res
        .pipe(JSONStream.parse('*'))
        .on('data', answer => {
          if (!Array.isArray(answer)) {
            events.error(new Error('Wrong back-end answer'))
          } else {
            let [name, ...args] = answer
            if (name === 'error') {
              let err = new Error('Error on back-end server')
              err.stack = args[1]
              events.error(err)
            } else if (events.filter(...args)) {
              if (!events[name]) {
                events.error(new Error('Unknown back-end answer'))
              } else {
                data = true
                events[name](...args)
              }
            }
          }
        })
        .on('error', err => {
          events.error(err)
        })
        .on('end', () => {
          if (!data) {
            events.error(new Error('Empty back-end answer'))
          } else if (events.end) {
            events.end()
          }
        })
    }
  })
  req.on('error', err => {
    events.error(err)
  })
  req.end(body)
}

function bindBackendProxy (app) {
  if (!app.options.controlSecret) {
    let e = new Error('`backend` requires `controlSecret` option')
    e.code = 'LOGUX_NO_CONTROL_SECRET'
    throw e
  }

  let backend = new URL(app.options.backend)
  backend.secret = app.options.controlSecret

  let resending = { }
  let accessing = { }
  let processing = { }

  function sendAction (action, meta) {
    let resendResolve
    if (action.type !== 'logux/subscribe') {
      resending[meta.id] = new Promise(resolve => {
        resendResolve = resolve
      })
    }
    let accessResolve, accessReject
    accessing[meta.id] = new Promise((resolve, reject) => {
      accessResolve = resolve
      accessReject = reject
    })
    let processResolve, processReject
    processing[meta.id] = new Promise((resolve, reject) => {
      processResolve = resolve
      processReject = reject
    })

    let checked = false
    let processed = false
    let error = false
    function currentReject (e) {
      if (resendResolve) resendResolve()
      if (checked) {
        processReject(e)
      } else {
        accessReject(e)
      }
    }

    let start = Date.now()
    app.emitter.emit('backendSent', action, meta)
    send(backend, ['action', action, meta], {
      filter (id) {
        return id === meta.id
      },
      resend (id, data) {
        if (!isResendCorrect(data)) {
          currentReject(new Error('Wrong resend data'))
        } else if (checked) {
          currentReject(new Error('Resend answer was sent after access'))
        } else if (action.type === 'logux/subscribe') {
          accessReject(new Error('Resend can be called on subscription'))
        } else {
          resendResolve(data)
        }
      },
      approved () {
        if (resendResolve) resendResolve()
        app.emitter.emit('backendGranted', action, meta, Date.now() - start)
        checked = true
        accessResolve(true)
      },
      forbidden () {
        if (resendResolve) resendResolve()
        error = true
        accessResolve(false)
      },
      processed () {
        if (!checked) {
          error = true
          accessReject(new Error('Processed answer was sent before access'))
        } else {
          processed = true
          app.emitter.emit('backendProcessed', action, meta, Date.now() - start)
          processResolve()
        }
      },
      unknownAction () {
        resendResolve()
        error = true
        app.unknownType(action, meta)
        accessResolve(false)
      },
      unknownChannel () {
        error = true
        app.wrongChannel(action, meta)
        accessResolve(false)
      },
      error (e) {
        error = true
        currentReject(e)
      },
      end () {
        if (!error || !checked || !processed) {
          currentReject(new Error('Back-end do not send required answers'))
        }
      }
    })
  }

  app.auth((userId, credentials) => new Promise((resolve, reject) => {
    let authId = nanoid()
    send(backend, ['auth', userId, credentials, authId], {
      filter (id) {
        return id === authId
      },
      authenticated () {
        resolve(true)
      },
      denied () {
        resolve(false)
      },
      error (e) {
        reject(e)
      }
    })
  }))
  app.otherType({
    resend (ctx, action, meta) {
      sendAction(action, meta)
      return resending[meta.id]
    },
    access (ctx, action, meta) {
      return accessing[meta.id]
    },
    process (ctx, action, meta) {
      return processing[meta.id]
    },
    finally (ctx, action, meta) {
      delete resending[meta.id]
      delete accessing[meta.id]
      delete processing[meta.id]
    }
  })
  app.otherChannel({
    access (ctx, action, meta) {
      sendAction(action, meta)
      return accessing[meta.id]
    },
    init (ctx, action, meta) {
      return processing[meta.id]
    },
    finally (ctx, action, meta) {
      delete accessing[meta.id]
      delete processing[meta.id]
    }
  })

  app.controls['POST /'] = {
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
