var path = require('path')
var fs = require('fs')

var promisify = require('../promisify')
var servers = require('./servers/servers')

Object.keys(servers).forEach(function (test) {
  it('reports ' + test, function () {
    var read = promisify(function (done) {
      fs.readFile(path.join(__dirname, 'servers', test + '.out'), done)
    })
    return Promise.all([servers[test](), read]).then(function (results) {
      var out = results[0][0]
      var exit = results[0][1]
      var snapshot = results[1].toString()

      if (test === 'throw' || test === 'uncatch') {
        expect(exit).toEqual(1)
      } else if (test !== 'unbind') {
        if (exit !== 0) {
          console.error(test + ' fall with:\n' + out)
        }
        expect(exit).toEqual(0)
      }
      expect(out).toEqual(snapshot)
    })
  })
})
