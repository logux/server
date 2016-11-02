module.exports = function promisify (callback) {
  return new Promise(function (resolve, reject) {
    callback(function (err) {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}
