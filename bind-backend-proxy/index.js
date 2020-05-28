let JSONStream = require('JSONStream')
let { nanoid } = require('nanoid')
let https = require('https')
let http = require('http')

const VERSION = 3

const RESEND_KEYS = [
  'channels',
  'channel',
  'nodes',
  'node',
  'clients',
  'client',
  'users',
  'user'
]

function send (backend, command, events) {
  let body = JSON.stringify({
    version: VERSION,
    commands: [command],
    secret: backend.secret
  })
  let protocol = backend.protocol === 'https:' ? https : http
  let req = protocol.request(
    {
      method: 'POST',
      host: backend.hostname,
      port: backend.port,
      path: backend.pathname + backend.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    },
    res => {
      if (res.statusCode < 200 || res.statusCode > 299) {
        events.error(new Error(`Backend responsed with ${res.statusCode} code`))
      } else {
        let data = false
        res
          .pipe(JSONStream.parse('*'))
          .on('data', answer => {
            if (
              typeof answer !== 'object' ||
              typeof answer.answer !== 'string'
            ) {
              events.error(new Error('Wrong back-end answer'))
            } else if (answer.answer === 'error') {
              let err = new Error('Error on back-end server')
              err.stack = answer.stack
              events.error(err)
            } else if (events.filter(answer)) {
              if (!events[answer.answer]) {
                events.error(new Error('Unknown back-end answer'))
              } else {
                data = true
                events[answer.answer](answer)
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
    }
  )
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

  let resending = {}
  let accessing = {}
  let processing = {}

  function sendAction (action, meta, headers) {
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
    send(
      backend,
      { command: 'action', action, meta, headers },
      {
        filter ({ id }) {
          return id === meta.id
        },
        resend (answer) {
          if (checked) {
            error = true
            currentReject(new Error('Resend answer was sent after access'))
          } else if (action.type === 'logux/subscribe') {
            error = true
            accessReject(new Error('Resend can be called on subscription'))
          } else {
            let resend = {}
            for (let key of RESEND_KEYS) {
              if (typeof answer[key] !== 'undefined') {
                resend[key] = answer[key]
              }
            }
            resendResolve(resend)
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
            app.emitter.emit(
              'backendProcessed',
              action,
              meta,
              Date.now() - start
            )
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
          if (!error && (!checked || !processed)) {
            currentReject(new Error('Back-end do not send required answers'))
          }
        }
      }
    )
  }

  app.auth(
    ({ userId, headers, cookie, token }) =>
      new Promise((resolve, reject) => {
        let random = nanoid()
        send(
          backend,
          { command: 'auth', authId: random, userId, token, headers, cookie },
          {
            filter ({ authId }) {
              return random === authId
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
          }
        )
      })
  )
  app.otherType({
    access (ctx, action, meta) {
      sendAction(action, meta, ctx.headers)
      return accessing[meta.id]
    },
    resend (ctx, action, meta) {
      return resending[meta.id]
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
      sendAction(action, meta, ctx.headers)
      return accessing[meta.id]
    },
    load (ctx, action, meta) {
      return processing[meta.id]
    },
    finally (ctx, action, meta) {
      delete accessing[meta.id]
      delete processing[meta.id]
    }
  })

  app.controls['POST /'] = {
    isValid ({ command, action, meta }) {
      return (
        command === 'action' &&
        typeof action === 'object' &&
        typeof action.type === 'string' &&
        typeof meta === 'object'
      )
    },
    command ({ action, meta }, req) {
      if (!app.types[action.type]) {
        meta.status = 'processed'
      }
      meta.backend = req.connection.remoteAddress
      return app.log.add(action, meta)
    }
  }
}

module.exports = bindBackendProxy
