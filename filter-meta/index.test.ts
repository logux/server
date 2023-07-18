import { expect, it } from 'vitest'

import { filterMeta, type ServerMeta } from '../index.js'

it('filters meta', () => {
  let meta1: ServerMeta = {
    added: 0,
    id: '1 test 0',
    reasons: [],
    server: '',
    status: 'processed',
    time: 0
  }
  expect(filterMeta(meta1)).toEqual({ id: '1 test 0', time: 0 })
  let meta2: ServerMeta = {
    added: 0,
    id: '1 test 0',
    reasons: [],
    server: '',
    subprotocol: '1.1.0',
    time: 0
  }
  expect(filterMeta(meta2).subprotocol).toEqual('1.1.0')
})
