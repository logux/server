'use strict'

const helpers = require('../reporters/human/helpers')

it('returns current time', () => {
  expect(helpers.now().valueOf()).toBeCloseTo(Date.now(), -2)
})
