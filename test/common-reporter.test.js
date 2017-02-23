'use strict'

const common = require('../reporters/human/common')

it('returns current time', () => {
  expect(common.now().valueOf()).toBeCloseTo(Date.now(), -2)
})
