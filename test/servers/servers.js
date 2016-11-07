var spawn = require('child_process').spawn
var path = require('path')

function exec (name) {
  return new Promise(function (resolve) {
    var out = ''
    var server = spawn(path.join(__dirname, name))
    server.stderr.on('data', function (chank) {
      out += chank
    })
    server.on('close', function (exitCode) {
      resolve([out, exitCode])
    })
    setTimeout(function () {
      server.kill('SIGINT')
    }, 500)
  })
}

module.exports = {

  destroy: function () {
    return exec('destroy.js')
  },

  unbind: function () {
    return exec('unbind.js')
  },

  throw: function () {
    return exec('throw.js')
  },

  uncatch: function () {
    return exec('uncatch.js')
  }

}
