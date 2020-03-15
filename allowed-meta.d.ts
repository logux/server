/**
 * List of meta keys permitted for clients.
 *
 *```js
 * const { ALLOWED_META } = require('@logux/server')
 * async function outMap (action, meta) {
 *   const filtered = { }
 *   for (const i in meta) {
 *     if (ALLOWED_META.includes(i)) {
 *       filtered[i] = meta[i]
 *     }
 *   }
 *   return [action, filtered]
 * }
 * ```
 */
export const ALLOWED_META: readonly ['id', 'time', 'subprotocol']
