const MAX_VERSION = 0

let http = require('http')
let url = require('url')

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
    let reqUrl = url.parse(req.url)
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
        } else if (body.password !== app.options.controlPassword) {
          res.statusCode = 403
          res.end('Wrong password')
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
          res.end('Set control password for Logux to give access to this page')
          return
        }
        if (reqUrl.query === 'PASSWORD') {
          res.statusCode = 400
          res.end(
            'Replace PASSWORD in URL to real control password ' +
            'from Logux server options'
          )
          return
        } else if (reqUrl.query !== app.options.controlPassword) {
          res.statusCode = 403
          res.end('Wrong password')
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
