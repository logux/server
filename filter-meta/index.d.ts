import { ServerMeta } from '../base-server'

/**
 * Remove all non-allowed keys from meta.
 *
 * @param meta Meta to remove keys.
 * @returns Meta with removed keys.
 */
export default function filterMeta (meta: ServerMeta): ServerMeta
