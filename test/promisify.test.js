let promisify = require('../promisify')

it('makes promise from callback function', () => {
  return promisify(done => {
    setTimeout(done, 1)
  })
})

it('sends first result to resolve', async () => {
  let result = await promisify(done => {
    setTimeout(() => {
      done(null, 'test')
    }, 1)
  })
  expect(result).toEqual('test')
})

it('rejects promise on error', async () => {
  try {
    await promisify(done => {
      setTimeout(() => {
        done(new Error('test'))
      }, 1)
    })
  } catch (err) {
    expect(err.message).toEqual('test')
  }
})
