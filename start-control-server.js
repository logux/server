let http = require('http')
let url = require('url')

const MAX_VERSION = 0
const NO_PASSWORD = 'Set `controlPassword` option for Logux ' +
                    'to have access to this page.\n' +
                    'Run `npx nanoid-cli` to generate secure password.'

function isValidBody (body) {
  if (typeof body !== 'object') return false
  if (typeof body.version !== 'number') return false
  if (typeof body.password !== 'string') return false
  if (!Array.isArray(body.commands)) return false
  for (let command of body.commands) {
    if (!Array.isArray(command)) return false
    if (typeof command[0] !== 'string') return false
  }
  return true
}

function startControlServer (app) {
  let httpServer = http.createServer((req, res) => {
    let urlString = req.url
    if (/^\/\w+%3F/.test(urlString)) urlString = decodeURIComponent(urlString)
    let reqUrl = url.parse(urlString)
    let rule = app.controls[reqUrl.pathname]
    if (!rule) {
      res.statusCode = 404
      res.end('Wrong path')
    } else if (rule.command && req.method !== 'POST') {
      res.statusCode = 405
      res.end('Wrong method')
    } else if (rule.request && req.method !== 'GET') {
      res.statusCode = 405
      res.end('Wrong method')
    } else if (req.method !== 'GET') {
      let json = ''
      req.on('data', chunk => {
        json += chunk
      })
      req.on('end', () => {
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
        } else if (body.version > MAX_VERSION) {
          res.statusCode = 400
          res.end('Unknown version')
        } else if (app.isBruteforce(req.connection.remoteAddress)) {
          res.statusCode = 429
          res.end('Too many wrong password attempts')
        } else if (body.password !== app.options.controlPassword) {
          res.statusCode = 403
          res.end('Wrong password')
          app.rememberBadAuth(req.connection.remoteAddress)
        } else {
          for (let i of body.commands) {
            if (!rule.isValid(i)) {
              res.statusCode = 400
              res.end('Wrong command')
              return
            }
          }
          Promise.all(body.commands.map(i => rule.command(i, req))).then(() => {
            res.end()
          })
        }
      })
    } else {
      if (!rule.safe) {
        if (!app.options.controlPassword) {
          res.statusCode = 403
          res.end(NO_PASSWORD)
          return
        } else if (app.isBruteforce(req.connection.remoteAddress)) {
          res.statusCode = 429
          res.end('Too many wrong password attempts')
          return
        } else if (reqUrl.query !== app.options.controlPassword) {
          res.statusCode = 403
          res.end('Wrong password')
          app.rememberBadAuth(req.connection.remoteAddress)
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

  app.unbind.push(() => {
    return new Promise(resolve => {
      httpServer.close(resolve)
    })
  })

  return new Promise((resolve, reject) => {
    httpServer.on('error', reject)
    httpServer.listen(app.options.controlPort, app.options.controlHost, resolve)
  })
}

module.exports = startControlServer
