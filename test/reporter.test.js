var path = require('path')
var fs = require('fs')

var promisify = require('../promisify')
var reporter = require('../reporter')
var reports = require('./snapshots/reports')

it('uses current time by default', function () {
  expect(reporter.now().getTime()).toBeCloseTo(Date.now(), -1)
})

describe('mocked output', function () {
  var originNow = reporter.now
  beforeAll(function () {
    reporter.now = function () {
      return new Date((new Date()).getTimezoneOffset() * 60000)
    }
  })
  afterAll(function () {
    reporter.now = originNow
  })

  Object.keys(reports).forEach(function (test) {
    it('reports ' + test, function () {
      return promisify(function (done) {
        fs.readFile(path.join(__dirname, 'snapshots', test + '.out'), done)
      }).then(function (shapshot) {
        var out = reporter.apply({ }, reports[test])
        expect(out).toEqual(shapshot.toString())
      })
    })
  })
})
