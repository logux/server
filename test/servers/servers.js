var childProcess = require('child_process')
var path = require('path')

function exec (name) {
  return new Promise(function (resolve) {
    childProcess.exec('NODE_ENV=test ' + path.join(__dirname, name), {
      timeout: 1000
    }, function (error, stdout, stderr) {
      resolve(stderr, error)
    })
  })
}

module.exports = {

  simple: function () {
    return exec('simple.js')
  }

}
