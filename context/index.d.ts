import type { AnyAction } from '@logux/core'

import type { ServerMeta } from '../base-server/index.js'
import type { Server } from '../server/index.js'

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
 */
export class Context<Data extends object = {}, Headers extends object = {}> {
  /**
   * Unique persistence client ID.
   *
   * ```js
   * server.clientIds.get(node.clientId)
   * ```
   */
  clientId: string

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
  data: Data

  /**
   * Client’s headers.
   *
   * ```js
   * ctx.sendBack({
   *   type: 'error',
   *   message: I18n[ctx.headers.locale || 'en'].error
   * })
   * ```
   */
  headers: Headers

  /**
   * Was action created by Logux server.
   *
   * ```js
   * access: (ctx, action, meta) => ctx.isServer
   * ```
   */
  isServer: boolean

  /**
   * Unique node ID.
   *
   * ```js
   * server.nodeIds.get(node.nodeId)
   * ```
   */
  nodeId: string

  /**
   * Logux server
   */
  server: Server

  /**
   * Action creator application subprotocol version in SemVer format.
   * Use {@link Context#isSubprotocol} to check it.
   */
  subprotocol: string

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
  userId: 'server' | string

  /**
   * @param nodeId Unique node ID.
   * @param clientId Unique persistence client ID.
   * @param userId User ID taken node ID.
   * @param subprotocol Action creator application subprotocol version
   *                    in SemVer format.
   * @param server Logux server
   */
  constructor(server: Server, meta: ServerMeta)

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
  isSubprotocol(range: string): boolean

  /**
   * Send action back to the client.
   *
   * ```js
   * ctx.sendBack({ type: 'login/success', token })
   * ```
   *
   * Action will not be processed by server’s callbacks from `Server#type`.
   *
   * @param action The action.
   * @param meta Action’s meta.
   * @returns Promise until action was added to the server log.
   */
  sendBack(action: AnyAction, meta?: Partial<ServerMeta>): Promise<void>
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
  Data extends object,
  ChannelParams extends object | string[],
  Headers extends object
> extends Context<Data, Headers> {
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
  params: ChannelParams
}
