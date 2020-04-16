let ip = require('ip')

const MAX_VERSION = 3
const MIN_VERSION = 3
const NO_SECRET = 'Set LOGUX_CONTROL_SECRET environment variable for Logux ' +
                  'to have access to this page.\n' +
                  'Run `npx nanoid` to generate secure secret.'

function isValidBody (body) {
  if (typeof body !== 'object') return false
  if (typeof body.version !== 'number') return false
  if (typeof body.secret !== 'string') return false
  if (!Array.isArray(body.commands)) return false
  for (let command of body.commands) {
    if (!Array.isArray(command)) return false
    if (typeof command[0] !== 'string') return false
  }
  return true
}

function bindControlServer (app) {
  let masks = app.options.controlMask.split(/,\s*/).map(i => ip.cidrSubnet(i))
  app.http.on('request', (req, res) => {
    let ipAddress = req.connection.remoteAddress
    if (masks.every(i => !i.contains(ipAddress))) {
      app.reporter('wrongControlIp', {
        ipAddress,
        mask: app.options.controlMask
      })
      res.statusCode = 403
      res.end('IP address is not in LOGUX_CONTROL_MASK/controlMask')
      return
    }

    let urlString = req.url
    if (/^\/\w+%3F/.test(urlString)) urlString = decodeURIComponent(urlString)
    let reqUrl = new URL(urlString, 'http://localhost')
    let rule = app.controls[req.method + ' ' + reqUrl.pathname]

    if (!rule) {
      let accepts = Object.keys(app.controls)
      if (accepts.find(i => i.endsWith(' ' + reqUrl.pathname))) {
        res.statusCode = 405
        res.end('Wrong method')
      } else {
        res.statusCode = 404
        res.end('Wrong path')
      }
    } else if (req.method !== 'GET') {
      let json = ''
      req.on('data', chunk => {
        json += chunk
      })
      req.on('end', async () => {
        let body
        try {
          body = JSON.parse(json)
        } catch (e) {
          res.statusCode = 400
          res.end('Wrong format')
          return
        }
        if (!isValidBody(body)) {
          res.statusCode = 400
          res.end('Wrong body')
        } else if (body.version < MIN_VERSION || body.version > MAX_VERSION) {
          res.statusCode = 400
          res.end('Back-end protocol version is not supported')
        } else if (app.isBruteforce(req.connection.remoteAddress)) {
          res.statusCode = 429
          res.end('Too many wrong secret attempts')
        } else if (body.secret !== app.options.controlSecret) {
          app.rememberBadAuth(req.connection.remoteAddress)
          app.reporter('wrongControlSecret', {
            ipAddress,
            wrongSecret: body.secret
          })
          res.statusCode = 403
          res.end('Wrong secret')
        } else {
          for (let i of body.commands) {
            if (!rule.isValid(i)) {
              res.statusCode = 400
              res.end('Wrong command')
              return
            }
          }
          await Promise.all(body.commands.map(i => rule.command(i, req)))
          res.end()
        }
      })
    } else {
      if (!rule.safe) {
        if (!app.options.controlSecret) {
          res.statusCode = 500
          res.end(NO_SECRET)
          return
        } else if (app.isBruteforce(req.connection.remoteAddress)) {
          res.statusCode = 429
          res.end('Too many wrong secret attempts')
          return
        } else if (reqUrl.search !== '?' + app.options.controlSecret) {
          app.rememberBadAuth(req.connection.remoteAddress)
          app.reporter('wrongControlSecret', {
            ipAddress,
            wrongSecret: reqUrl.search.slice(1)
          })
          res.statusCode = 403
          res.end('Wrong secret')
          return
        }
      }
      let answer = rule.request(req)
      for (let name in answer.headers) {
        res.setHeader(name, answer.headers[name])
      }
      res.end(answer.body)
    }
  })
}

module.exports = bindControlServer
