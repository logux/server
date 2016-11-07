#!/usr/bin/env node

var Server = require('../../server')
var app = new Server({
  env: 'test',
  uniqName: 'server',
  subprotocol: [1, 0],
  supports: [1]
})

app.unbind.push(function () {
  return new Promise(function (resolve) {
    setTimeout(function () {
      process.stderr.write(' Custom destroy task finished\n')
      resolve()
    }, 10)
  })
})

app.listen()

process.on('message', function (msg) {
  if (msg === 'close') {
    console.error('close')
    app.destroy()
  }
})
