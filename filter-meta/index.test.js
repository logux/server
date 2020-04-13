let { filterMeta } = require('..')

it('filters meta', () => {
  let meta1 = {
    id: '1 test 0',
    time: 0,
    status: 'processed'
  }
  expect(filterMeta(meta1)).toEqual({ id: '1 test 0', time: 0 })
  let meta2 = {
    id: '1 test 0',
    time: 0,
    subprotocol: '1.1.0'
  }
  expect(filterMeta(meta2).subprotocol).toEqual('1.1.0')
})
