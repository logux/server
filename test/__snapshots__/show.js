#!/usr/bin/env node

var fs = require('fs')
var path = require('path')

function show (result) {
  Object.keys(result).sort().reverse().forEach(function (file) {
    var test = file.replace(/\.test\.js\.snap$/, '')
    result[file].split('exports[`').forEach(function (str) {
      if (str.trim().length === 0) return
      var parts = str.replace(/"\s*`;\s*$/, '').split(/`] = `\s*"/)
      process.stdout.write(
        test + ' ' +
        parts[0].replace(/^test /, '').replace(/ 1$/, '') + ':\n\n')
      process.stdout.write(parts[1])
    })
  })
}

fs.readdir(__dirname, function (err, list) {
  if (err) throw err
  var snaps = list.filter(function (i) {
    return /\.snap$/.test(i)
  })

  var result = { }
  snaps.forEach(function (file) {
    fs.readFile(path.join(__dirname, file), function (err2, content) {
      if (err2) throw err2
      result[file] = content.toString()
      if (Object.keys(result).length === snaps.length) show(result)
    })
  })
})
