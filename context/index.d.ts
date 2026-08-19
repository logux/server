import type { Action, AnyAction } from '@logux/core'

import type { ServerMeta } from '../base-server/index.js'
import type { ServerClient } from '../server-client/index.js'
import type { Server } from '../server/index.js'

export class ConnectContext<Headers extends object = unknown> {
  /**
   * Unique persistence client ID.
   *
   * ```js
   * server.clientIds.get(node.clientId)
   * ```
   */
  clientId: string

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
   * Action creator application subprotocol version.
   */
  subprotocol: number

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
  userId: string

  constructor(server: Server, client: ServerClient)

  /**
   * Wait until the client will confirm all actions, which were sent to it.
   *
   * Use it to send a long history without loading it all into the memory:
   * the client’s speed will limit how fast you read the database.
   *
   * ```js
   * while (await ctx.drain()) {
   *   let page = await cursor.next(100)
   *   if (!page.length) break
   *   ctx.sendBack(page.map(i => i.action))
   * }
   * ```
   *
   * @returns Promise with `false` if the client was disconnected.
   */
  drain(): Promise<boolean>

  /**
   * Send action back to the client.
   *
   * ```js
   * ctx.sendBack({ type: 'login/success', token })
   * ```
   *
   * An array of actions will be sent in a single message. Use it to send
   * a big history page by page instead of a message per action.
   *
   * ```js
   * ctx.sendBack(page.map(i => i.action))
   * ```
   *
   * Every action in the array can have own meta as `[action, meta]`.
   *
   * Action will not be processed by server’s callbacks from `Server#type`.
   *
   * @param action The action or the array of actions.
   * @param meta Action’s meta.
   * @returns Promise until action was added to the server log.
   */
  sendBack<TypeAction extends Action = AnyAction>(
    action:
      | (TypeAction | [TypeAction, Partial<ServerMeta>])[]
      | TypeAction,
    meta?: Partial<ServerMeta>
  ): Promise<void>
}

/**
 * Action context.
 * ```
 */
export class Context<
  Data extends object = unknown,
  Headers extends object = unknown
> extends ConnectContext<Headers> {
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
   * Was action created by Logux server.
   *
   * ```js
   * access: (ctx, action, meta) => ctx.isServer
   * ```
   */
  isServer: boolean

  constructor(server: Server, meta: ServerMeta)
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
