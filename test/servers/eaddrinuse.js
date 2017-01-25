#!/usr/bin/env node
var Server = require('../../server')

var appOne = new Server({
  env: 'test',
  nodeId: 'server_1',
  subprotocol: '1.0.0',
  supports: '1.x'
})

var appTwo = new Server({
  env: 'test',
  nodeId: 'server_2',
  subprotocol: '1.0.0',
  supports: '1.x'
})

appOne.auth(function () {
  return Promise.resolve(true)
})

appTwo.auth(function () {
  return Promise.resolve(true)
})

appOne.listen(appOne.loadOptions(process, {
  port: '31337',
  host: '127.0.0.1'
}))

appTwo.listen(appTwo.loadOptions(process, {
  port: '31337',
  host: '127.0.0.1'
}))
