#!/usr/bin/env node

var servers = require('./servers')
var path = require('path')
var fs = require('fs')

var DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

Object.keys(servers).forEach(function (test) {
  servers[test]().then(function (out) {
    out = out.replace(DATE, '1970-01-01 00:00:00')
    fs.writeFileSync(path.join(__dirname, test + '.out'), out)
    process.stdout.write(out)
  })
})
