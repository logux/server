var reporter = require('../reporter')

it('returns current time', function () {
  expect(reporter.now().valueOf()).toBeCloseTo(Date.now(), -2)
})
