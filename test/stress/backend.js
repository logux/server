#!/usr/bin/env node

let delay = require('nanodelay')
let chalk = require('chalk')
let http = require('http')

function send (action, meta) {
  let body = JSON.stringify({
    version: 0,
    password: 'secret',
    commands: [
      ['action', action, meta]
    ]
  })
  return new Promise((resolve, reject) => {
    let req = http.request({
      method: 'POST',
      host: 'localhost',
      port: 31338,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      if (res.statusCode < 200 || res.statusCode > 299) {
        reject(new Error('Logux error'))
      } else {
        process.stdout.write(chalk.blue('R'))
        resolve()
      }
    })
    req.on('error', reject)
    req.end(body)
  })
}

let server = http.createServer((req, res) => {
  let body = ''
  req.on('data', data => {
    body += data
  })
  req.on('end', () => {
    let data = JSON.parse(body)
    let [type, action, meta] = data.commands[0]
    let nodes = [meta.id.split(' ')[1]]
    let processing = delay(500).then(() => {
      res.write(`[["approved","${ meta.id }"]`)
    })
    if (type === 'action' && action.type === 'logux/subscribe') {
      processing = processing.then(() => {
        return delay(300)
      }).then(() => {
        return Promise.all([
          send({ type: 'project/name', value: 'A' }, { nodes }),
          send({ type: 'project/status', value: 'ok' }, { nodes }),
          send({ type: 'project/payment', value: 'paid' }, { nodes })
        ])
      }).then(() => {
        process.stdout.write(chalk.green('S'))
      })
    } else if (type === 'action' && action.type === 'project/name') {
      processing = processing.then(() => {
        return delay(500)
      }).then(() => {
        process.stdout.write(chalk.yellow('A'))
      })
    }
    processing.then(() => {
      res.write(`,["processed","${ meta.id }"]]`)
      res.end()
    }).catch(e => {
      process.stderr.write(chalk.red(e.stack))
      process.exit(1)
    })
  })
})

server.listen(31339)
