const reporter = require('../reporter')

it('returns current time', () => {
  expect(reporter.now().valueOf()).toBeCloseTo(Date.now(), -2)
})
