import { Action } from '@logux/core'

import BaseServer, { BaseServerOptions, ServerMeta } from '../base-server'

/**
 * Action context.
 *
 * ```js
 * server.type('FOO', {
 *   access (ctx, action, meta) {
 *     return ctx.isSubprotocol('3.x') ? check3(action) : check4(action)
 *   }
 * })
 * ```
 *
 * @template D Type for `ctx.data`.
 */
export default class Context<D extends object> {
  /**
   * @param nodeId Unique node ID.
   * @param clientId Unique persistence client ID.
   * @param userId User ID taken node ID.
   * @param subprotocol Action creator application subprotocol version in SemVer format.
   * @param server Logux server
   */
  constructor(
    nodeId: string,
    clientId: string,
    userId: string | undefined,
    subprotocol: string,
    server: BaseServer
  )

  /**
   * Open structure to save some data between different steps of processing.
   *
   * ```js
   * server.type('RENAME', {
   *   access (ctx, action, meta) {
   *     ctx.data.user = findUser(ctx.userId)
   *     return ctx.data.user.hasAccess(action.projectId)
   *   }
   *   process (ctx, action, meta) {
   *     return ctx.data.user.rename(action.projectId, action.name)
   *   }
   * })
   * ```
   */
  data: D

  /**
   * Unique node ID.
   *
   * ```js
   * server.nodeIds[node.nodeId]
   * ```
   */
  nodeId: string

  /**
   * User ID taken node ID.
   *
   * ```js
   * async access (ctx, action, meta) {
   *   const user = await db.getUser(ctx.userId)
   *   return user.admin
   * }
   * ```
   */
  userId: 'server' | string | undefined

  /**
   * Unique persistence client ID.
   *
   * ```js
   * server.clientIds[node.clientId]
   * ```
   */
  clientId: string

  /**
   * Was action created by Logux server.
   *
   * ```js
   * access: (ctx, action, meta) => ctx.isServer
   * ```
   */
  isServer: boolean

  /**
   * Action creator application subprotocol version in SemVer format.
   * Use {@link Context#isSubprotocol} to check it.
   */
  subprotocol: string

  /**
   * Logux server
   */
  server: BaseServer

  /**
   * Check creator subprotocol version. It uses `semver` npm package
   * to parse requirements.
   *
   * ```js
   * if (ctx.isSubprotocol('2.x')) {
   *   useOldAPI()
   * }
   * ```
   *
   * @param range npm’s version requirements.
   * @returns Is version satisfies requirements.
   */
  isSubprotocol (range: string): boolean

  /**
   * Send action back to the client.
   *
   * ```js
   * ctx.sendBack({ type: 'login/success', token })
   * ```
   *
   * @param action The action.
   * @param meta Action’s meta.
   * @returns Promise until action was added to the server log.
   */
  sendBack (action: Action, meta?: ServerMeta): Promise<void>
}

/**
 * Subscription context.
 *
 * ```js
 * server.channel('user/:id', {
 *   access (ctx, action, meta) {
 *     return ctx.params.id === ctx.userId
 *   }
 * })
 * ```
 */
export class ChannelContext<
  D extends object, P extends object | string[]
> extends Context<D> {
  /**
   * Parsed variable parts of channel pattern.
   *
   * ```js
   * server.channel('user/:id', {
   *   access (ctx, action, meta) {
   *     action.channel //=> user/10
   *     ctx.params //=> { id: '10' }
   *   }
   * })
   * server.channel(/post\/(\d+)/, {
   *   access (ctx, action, meta) {
   *     action.channel //=> post/10
   *     ctx.params //=> ['post/10', '10']
   *   }
   * })
   * ```
   */
  params: P
}
