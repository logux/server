var promisify = require('../promisify')

it('makes promise from callback function', function () {
  return promisify(function (done) {
    setTimeout(done, 1)
  })
})

it('sends first result to resolve', function () {
  return promisify(function (done) {
    setTimeout(function () {
      done(null, 'test')
    }, 1)
  }).then(function (result) {
    expect(result).toEqual('test')
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
