/**
 * List of meta keys permitted for clients.
 *
 *```js
 * import { ALLOWED_META } from '@logux/server'
 * async function onSend (action, meta) {
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
export const ALLOWED_META: string[]
