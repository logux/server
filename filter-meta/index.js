const ALLOWED_META = require('../allowed-meta')

module.exports = function filterMeta (meta) {
  let result = { }
  for (let i of ALLOWED_META) {
    if (typeof meta[i] !== 'undefined') result[i] = meta[i]
  }
  return result
}
