#!/usr/bin/env node

import http from 'node:http'
import { setTimeout } from 'node:timers/promises'
import pico from 'picocolors'

function send(action, meta) {
  let body = JSON.stringify({
    commands: [['action', action, meta]],
    secret: 'secret',
    version: 0
  })
  return new Promise((resolve, reject) => {
    let req = http.request(
      {
        headers: {
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'application/json'
        },
        host: 'localhost',
        method: 'POST',
        port: 31338
      },
      res => {
        if (res.statusCode < 200 || res.statusCode > 299) {
          reject(new Error('Logux error'))
        } else {
          process.stdout.write(pico.blue('R'))
          resolve()
        }
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

let server = http.createServer((req, res) => {
  let body = ''
  req.on('data', data => {
    body += data
  })
  req.on('end', async () => {
    try {
      let data = JSON.parse(body)
      let [type, action, meta] = data.commands[0]
      let nodes = [meta.id.split(' ')[1]]
      await setTimeout(500)
      res.write(`[["approved","${meta.id}"]`)
      if (type === 'action' && action.type === 'logux/subscribe') {
        await setTimeout(300)
        await send({ type: 'project/name', value: 'A' }, { nodes })
        await send({ type: 'project/status', value: 'ok' }, { nodes })
        await send({ type: 'project/payment', value: 'paid' }, { nodes })
        process.stdout.write(pico.green('S'))
      } else if (type === 'action' && action.type === 'project/name') {
        await setTimeout(500)
        process.stdout.write(pico.yellow('A'))
      }
      res.write(`,["processed","${meta.id}"]]`)
      res.end()
    } catch (e) {
      process.stderr.write(pico.red(e.stack))
      process.exit(1)
    }
  })
})

server.listen(31339)
