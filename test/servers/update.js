#!/usr/bin/env node

var path = require('path')
var fs = require('fs')

var servers = require('./servers')

var DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

Object.keys(servers).forEach(function (test) {
  servers[test]().then(function (results) {
    var out = results[0].replace(DATE, '1970-01-01 00:00:00')
    fs.writeFileSync(path.join(__dirname, test + '.out'), out)
    process.stdout.write('\n' + test + ':\n')
    process.stdout.write(out)
  })
})
