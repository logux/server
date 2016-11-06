var promisify = require('../promisify')
var servers = require('./servers/servers')
var path = require('path')
var fs = require('fs')

var DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

Object.keys(servers).forEach(function (test) {
  it('reports ' + test, function () {
    var read = promisify(function (done) {
      fs.readFile(path.join(__dirname, 'servers', test + '.out'), done)
    })
    return Promise.all([servers[test](), read]).then(function (results) {
      var out = results[0][0].replace(DATE, '1970-01-01 00:00:00')
      var exit = results[0][1]
      var snapshot = results[1].toString()

      if (test === 'error' || test === 'promise') {
        expect(exit).toEqual(1)
      } else if (test !== 'unbind') {
        expect(exit).toEqual(0)
      }
      expect(out).toEqual(snapshot)
    })
  })
})
