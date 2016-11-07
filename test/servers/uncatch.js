#!/usr/bin/env node

var Server = require('../../server')
new Server({
  env: 'test',
  uniqName: 'server',
  subprotocol: [1, 0],
  supports: [1]
})

new Promise(function (resolve, reject) {
  setTimeout(function () {
    var error = new Error('Test Error')
    error.stack = error.stack.split('\n').slice(0, 2).join('\n') + '\n' +
      '    at ontimeout (timers.js:365:14)\n' +
      '    at tryOnTimeout (timers.js:237:5)\n' +
      '    at Timer.listOnTimeout (timers.js:207:5)\n'
    reject(error)
  }, 10)
})
