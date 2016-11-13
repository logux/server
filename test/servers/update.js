#!/usr/bin/env node

var path = require('path')
var fs = require('fs')

var servers = require('./servers')

Object.keys(servers).forEach(function (test) {
  servers[test]().then(function (results) {
    fs.writeFileSync(path.join(__dirname, test + '.out'), results[0])
    process.stdout.write('\n' + test + ':\n')
    process.stdout.write(results[0])
  })
})
