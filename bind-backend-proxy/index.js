import { LoguxError } from '@logux/core'
import JSONStream from 'JSONStream'
import { nanoid } from 'nanoid'
import https from 'https'
import http from 'http'

const VERSION = 4

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

function send(backend, command, events) {
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
        events.error(new Error(`Backend responded with ${res.statusCode} code`))
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
              err.stack = answer.details
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

export function bindBackendProxy(app) {
  if (app.options.controlSecret) {
    app.controls['POST /'] = {
      isValid({ command, action, meta }) {
        return (
          command === 'action' &&
          typeof action === 'object' &&
          typeof action.type === 'string' &&
          typeof meta === 'object'
        )
      },
      command({ action, meta }, req) {
        if (!app.types[action.type] && !app.getRegexProcessor(action.type)) {
          meta.status = 'processed'
        }
        meta.backend = req.connection.remoteAddress
        return app.log.add(action, meta)
      }
    }
  }

  if (!app.options.backend) return
  if (!app.options.controlSecret) {
    let e = new Error('`backend` requires `controlSecret` option')
    e.code = 'LOGUX_NO_CONTROL_SECRET'
    throw e
  }

  let backend = new URL(app.options.backend)
  backend.secret = app.options.controlSecret

  let resending = new Map()
  let accessing = new Map()
  let processing = new Map()
  let actions = new Map()

  function sendAction(action, meta, headers) {
    let resendResolve
    if (action.type !== 'logux/subscribe') {
      resending.set(
        meta.id,
        new Promise(resolve => {
          resendResolve = resolve
        })
      )
    }
    let accessResolve, accessReject
    accessing.set(
      meta.id,
      new Promise((resolve, reject) => {
        accessResolve = resolve
        accessReject = reject
      })
    )
    let processResolve, processReject
    processing.set(
      meta.id,
      new Promise((resolve, reject) => {
        processResolve = resolve
        processReject = reject
      })
    )

    let checked = false
    let processed = false
    let error = false
    function currentReject(e) {
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
        filter({ id }) {
          return id === meta.id
        },
        resend(answer) {
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
        action(data) {
          let promise = app.log.add(data.action, {
            status: 'processed',
            ...data.meta
          })
          if (actions.has(meta.id)) {
            actions.get(meta.id).push(promise)
          } else {
            actions.set(meta.id, [promise])
          }
        },
        approved() {
          if (resendResolve) resendResolve()
          app.emitter.emit('backendGranted', action, meta, Date.now() - start)
          checked = true
          accessResolve(true)
        },
        forbidden() {
          if (resendResolve) resendResolve()
          error = true
          accessResolve(false)
        },
        async processed() {
          if (!checked) {
            error = true
            accessReject(new Error('Processed answer was sent before access'))
          } else {
            processed = true
            await Promise.all(actions.get(meta.id) || [])
            app.emitter.emit(
              'backendProcessed',
              action,
              meta,
              Date.now() - start
            )
            processResolve()
          }
        },
        unknownAction() {
          resendResolve()
          error = true
          app.unknownType(action, meta)
          accessResolve(false)
        },
        unknownChannel() {
          error = true
          app.wrongChannel(action, meta)
          accessResolve(false)
        },
        error(e) {
          error = true
          currentReject(e)
        },
        end() {
          if (!error && (!checked || !processed)) {
            currentReject(new Error('Back-end do not send required answers'))
          }
        }
      }
    )
  }

  app.auth(
    ({ userId, headers, cookie, token, client }) =>
      new Promise((resolve, reject) => {
        let random = nanoid()
        send(
          backend,
          {
            command: 'auth',
            authId: random,
            userId,
            token,
            headers,
            cookie,
            subprotocol: client.node.remoteSubprotocol
          },
          {
            filter({ authId }) {
              return random === authId
            },
            wrongSubprotocol({ supported }) {
              reject(
                new LoguxError('wrong-subprotocol', {
                  used: client.node.remoteSubprotocol,
                  supported
                })
              )
            },
            authenticated({ subprotocol }) {
              if (subprotocol) {
                app.options.subprotocol = subprotocol
                client.node.options.subprotocol = subprotocol
              }
              resolve(true)
            },
            denied() {
              resolve(false)
            },
            error(e) {
              reject(e)
            }
          }
        )
      })
  )
  app.otherType({
    access(ctx, action, meta) {
      sendAction(action, meta, ctx.headers)
      return accessing.get(meta.id)
    },
    resend(ctx, action, meta) {
      if (!resending.has(meta.id)) {
        sendAction(action, meta, ctx.headers)
      }
      return resending.get(meta.id)
    },
    process(ctx, action, meta) {
      return processing.get(meta.id)
    },
    finally(ctx, action, meta) {
      actions.delete(meta.id)
      resending.delete(meta.id)
      accessing.delete(meta.id)
      processing.delete(meta.id)
    }
  })
  app.otherChannel({
    access(ctx, action, meta) {
      sendAction(action, meta, ctx.headers)
      return accessing.get(meta.id)
    },
    load(ctx, action, meta) {
      return processing.get(meta.id)
    },
    finally(ctx, action, meta) {
      actions.delete(meta.id)
      accessing.delete(meta.id)
      processing.delete(meta.id)
    }
  })
}
