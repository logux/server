import { expect, it } from 'vitest'

import { ALLOWED_META } from '../index.js'

it('has allowed meta keys list', () => {
  for (let key of ALLOWED_META) {
    expect(typeof key).toEqual('string')
  }
})
