function forcePromise (callback) {
  let result
  try {
    result = callback()
  } catch (e) {
    return Promise.reject(e)
  }
  if (typeof result !== 'object' || typeof result.then !== 'function') {
    return Promise.resolve(result)
  } else {
    return result
  }
}

module.exports = forcePromise
