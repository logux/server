export function bindControlServer(app, custom) {
  if (app.options.disableHttpServer) {
    return
  }

  app.httpServer.on('request', async (req, res) => {
    let urlString = req.url
    if (/^\/\w+%3F/.test(urlString)) urlString = decodeURIComponent(urlString)
    let reqUrl = new URL(urlString, 'http://localhost')
    let rule = app.controls[req.method + ' ' + reqUrl.pathname]

    if (!rule) {
      if (custom) {
        custom(req, res)
      } else {
        let accepts = Object.keys(app.controls)
        if (accepts.some(i => i.endsWith(' ' + reqUrl.pathname))) {
          res.statusCode = 405
          res.end('Wrong method')
        } else {
          res.statusCode = 404
          res.end('Wrong path')
        }
      }
    } else if (req.method === 'GET') {
      let answer = await rule.request(req)
      for (let name in answer.headers) {
        res.setHeader(name, answer.headers[name])
      }
      res.end(answer.body)
    }
  })
}
