import type { ServerMeta } from '../base-server/index.js'

/**
 * Remove all non-allowed keys from meta.
 *
 * @param meta Meta to remove keys.
 * @returns Meta with removed keys.
 */
export function filterMeta(meta: ServerMeta): ServerMeta
