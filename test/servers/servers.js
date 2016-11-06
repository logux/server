var childProcess = require('child_process')
var path = require('path')

function exec (name, env) {
  if (!env) env = ''
  env = 'FORCE_COLOR=1 NODE_ENV=development ' + env + ' '

  return new Promise(function (resolve) {
    childProcess.exec(env + path.join(__dirname, name), {
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
