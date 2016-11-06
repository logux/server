module.exports = function promisify (callback) {
  return new Promise(function (resolve, reject) {
    callback(function (err, result) {
      if (err) {
        reject(err)
      } else {
        resolve(result)
      }
    })
  })
}
