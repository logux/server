import { ALLOWED_META } from '../allowed-meta/index.js'

export function filterMeta(meta) {
  let result = {}
  for (let i of ALLOWED_META) {
    if (typeof meta[i] !== 'undefined') result[i] = meta[i]
  }
  return result
}
