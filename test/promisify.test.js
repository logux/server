var promisify = require('../promisify')

it('makes promise from callback function', function () {
  return promisify(function (done) {
    setTimeout(done, 1)
  })
})

it('rejects promise on error', function () {
  return promisify(function (done) {
    setTimeout(function () {
      done(new Error('test'))
    }, 1)
  }).catch(function (err) {
    expect(err.message).toEqual('test')
  })
})
