var promisify = require('../promisify')

it('makes promise from callback function', () => {
  return promisify(done => {
    setTimeout(done, 1)
  })
})

it('sends first result to resolve', () => {
  return promisify(done => {
    setTimeout(() => {
      done(null, 'test')
    }, 1)
  }).then(result => {
    expect(result).toEqual('test')
  })
})

it('rejects promise on error', () => {
  return promisify(done => {
    setTimeout(() => {
      done(new Error('test'))
    }, 1)
  }).catch(err => {
    expect(err.message).toEqual('test')
  })
})
