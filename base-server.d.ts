import {
  Action as UserAction,
  ID,
  Log,
  Meta,
  ServerConnection,
  Store,
  TestTime
} from '@logux/core'
import { Server as HTTPServer } from 'http'

import { Context, ChannelContext, LoguxPatternParams } from './context'
import { ServerClient } from './server-client'

export type ServerMeta = Meta & {
  /**
   * Action processing status
   */
  status?: 'waiting' | 'processed' | 'error'

  /**
   * Node ID of the server received the action.
   */
  server: string

  /**
   * Array and channel string: all clients subscribed
   * to listed channels will receive the action.
   */
  channels?: string[]

  /**
   * Array and user string: all clients with listed user
   * IDs will receive the action.
   */
  users?: string[]

  /**
   * Array and client string: all clients with listed client
   * IDs will receive the action.
   */
  clients?: string[]

  /**
   * Array and node string: all clients with listed node
   * IDs will receive the action.
   */
  nodes?: string[]
}

export type LoguxSubscribeAction = {
  type: 'logux/subscribe'
  channel?: string
  since?: {
    id: string
    time: number
  }
}

export type LoguxUnsubscribeAction = {
  type: 'logux/unsubscribe'
  channel?: string
}

export type LoguxProcessedAction = {
  type: 'logux/processed'
  id?: ID
}

export type LoguxUndoAction = {
  type: 'logux/undo'
  id?: ID
  reason?: string
}

export type LoguxAction =
  | LoguxSubscribeAction
  | LoguxUnsubscribeAction
  | LoguxProcessedAction
  | LoguxUndoAction

type ActionReporter = {
  action: UserAction | LoguxAction
  meta: ServerMeta
}

type SubscriptionReporter = {
  actionId: ID
  channel: string
}

type CleanReporter = {
  actionId: ID
}

type AuthenticationReporter = {
  connectionId: string
  subprotocol: string
  nodeId: string
}

export type LoguxServerReporter = {
  add: ActionReporter
  useless: ActionReporter
  clean: CleanReporter
  error: {
    err: Error
    fatal?: true
    actionId?: ID
    nodeId?: string
    connectionId?: string
  }
  clientError: {
    err: Error
    nodeId?: string
    connectionId?: string
  }
  connect: {
    connectionId: string
    ipAddress: string
  }
  disconnect: {
    nodeId?: string
    connectionId?: string
  }
  destroy: void
  unknownType: {
    type: UserAction['type']
    actionId: ID
  }
  wrongChannel: SubscriptionReporter
  processed: {
    actionId: ID
    latency: number
  }
  subscribed: SubscriptionReporter
  unsubscribed: SubscriptionReporter
  denied: CleanReporter
  authenticated: AuthenticationReporter
  unauthenticated: AuthenticationReporter
  zombie: {
    nodeId: string
  }
  listen: {
    controlPassword: LoguxBaseServerOptions['controlPassword']
    controlHost: LoguxBaseServerOptions['controlHost']
    controlPort: LoguxBaseServerOptions['controlPort']
    loguxServer: string
    environment: LoguxBaseServerOptions['env']
    subprotocol: LoguxBaseServerOptions['subprotocol']
    supports: LoguxBaseServerOptions['supports']
    backend: LoguxBaseServerOptions['backend']
    server: boolean
    nodeId: string
    redis: LoguxBaseServerOptions['redis']
    notes: Object
    cert: boolean
    host: LoguxBaseServerOptions['host']
    port: LoguxBaseServerOptions['port']
  }
}

export type LoguxBaseServerOptions = {
  /**
   * Server current application subprotocol version in SemVer format.
   */
  subprotocol: string

  /**
   * npm’s version requirements for client subprotocol version.
   */
  supports: string

  /**
   * Application root to load files and show errors.
   * Default is `process.cwd()`.
   */
  root?: string

  /**
   * Timeout in milliseconds to disconnect connection.
   * Default is `20000`.
   */
  timeout?: number

  /**
   * Milliseconds since last message to test connection by sending ping.
   * Default is `10000`.
   */
  ping?: number

  /**
   * URL to PHP, Ruby on Rails, or other backend to process actions and
   * authentication.
   */
  backend?: string

  /**
   * URL to Redis for Logux Server Pro scaling.
   */
  redis?: string

  /**
   * Host to bind HTTP server to control Logux server.
   * Default is `127.0.0.1`.
   */
  controlHost?: string

  /**
   * Port to control the server. Default is `31338`.
   */
  controlPort?: number

  /**
   * Password to control the server.
   */
  controlPassword?: string

  /**
   * Store to save log. Will be {@link @logux/core:MemoryStore}, by default.
   */
  store?: Store

  /**
   * Test time to test server.
   */
  time?: TestTime

  /**
   * Custom random ID to be used in node ID.
   */
  id?: string

  /**
   * Development or production server mode. By default,
   * it will be taken from `NODE_ENV` environment variable.
   * On empty `NODE_ENV` it will be `'development'`.
   */
  env?: 'production' | 'development'

  /**
   * Process ID, to display in reporter.
   */
  pid?: number

  /**
   * HTTP server to connect WebSocket server to it. Same as in `ws.Server`.
   */
  server?: HTTPServer

  /**
   * Port to bind server. It will create HTTP server manually to connect
   * WebSocket server to it. Default is `31337`.
   */
  port?: number

  /**
   * IP-address to bind server. Default is `127.0.0.1`.
   */
  host?: string

  /**
   * SSL key or path to it. Path could be relative from server root.
   * It is required in production mode, because WSS is highly recommended.
   */
  key?: string

  /**
   * SSL certificate or path to it. Path could be relative from server
   * root. It is required in production mode, because WSS is highly
   * recommended.
   */
  cert?: string

  /**
   * Function to show current server status.
   */
  reporter?: <Event extends keyof LoguxServerReporter>(
    event: Event,
    payload: LoguxServerReporter[Event]
  ) => void
}

/**
 * The authentication callback.
 *
 * @param userId User ID.
 * @param credentials The client credentials.
 * @param client Client object.
 * @returns `true` if credentials was correct
 */
export type LoguxAuthenticator = (
  userId: string | false,
  credentials: string | undefined,
  server: ServerClient
) => boolean | Promise<boolean>

/**
 * Check does user can do this action.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns `true` if client are allowed to use this action.
 */
export type LoguxAuthorizer<Action extends UserAction = UserAction> = (
  ctx: Context,
  action: Action,
  meta: ServerMeta
) => boolean | Promise<boolean>

/**
 * Return object with keys for meta to resend action to other users.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Meta’s keys.
 */
export type LoguxResender<Action extends UserAction = UserAction> = (
  ctx: Context,
  action: Action,
  meta: ServerMeta
) => Object | Promise<Object>

/**
 * Action business logic.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Promise when processing will be finished.
 */
export type LoguxProcessor<Action extends UserAction = UserAction> = (
  ctx: Context,
  action: Action,
  meta: ServerMeta
) => void | Promise<void>

/**
 * Callback which will be run on the end of action processing
 * or on an error.
 */
export type LoguxActionFinally<Action extends UserAction = UserAction> = (
  ctx: Context,
  action: Action,
  meta: ServerMeta
) => void

/**
 * Channel filter callback
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Should action be sent to client.
 */
export type LoguxChannelFilter<Action extends UserAction = UserAction> = (
  ctx: Context,
  action: Action,
  meta: ServerMeta
) => boolean

/**
 * Channel authorizer callback
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns `true` if client are allowed to subscribe to this channel.
 */
export type LoguxChannelAuthorizer<
  Action extends UserAction = UserAction,
  PatternParams extends LoguxPatternParams = {}
> = (
  ctx: ChannelContext<PatternParams>,
  action: Action,
  meta: ServerMeta
) => boolean | Promise<boolean>

/**
 * Generates custom filter for channel’s actions.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Actions filter.
 */
export type LoguxFilterCreator<
  Action extends UserAction = UserAction,
  PatternParams extends LoguxPatternParams = {}
> = (
  ctx: ChannelContext<PatternParams>,
  action: Action,
  meta: ServerMeta
) => LoguxChannelFilter<Action> | undefined

/**
 * Creates actions with initial state.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Promise during initial actions loading.
 */
export type LoguxInitialized<
  Action extends UserAction = UserAction,
  PatternParams extends LoguxPatternParams = {}
> = (
  ctx: ChannelContext<PatternParams>,
  action: Action,
  meta: ServerMeta
) => void | Promise<void>

/**
 * Callback which will be run on the end of subscription
 * processing or on an error.
 */
export type LoguxSubscriptionFinally<
  Action extends UserAction = UserAction,
  PatternParams extends LoguxPatternParams = {}
> = (
  ctx: ChannelContext<PatternParams>,
  action: Action,
  meta: ServerMeta
) => void

/**
 * Action type’s callbacks.
 */
export type LoguxActionCallbacks<Action extends UserAction = UserAction> = {
  access: LoguxAuthorizer<Action>
  resend?: LoguxResender<Action>
  process?: LoguxProcessor<Action>
  finally?: LoguxActionFinally<Action>
}

/**
 * Channel callbacks.
 */
export type LoguxChannelCallbacks<
  Action extends UserAction = UserAction,
  PatternParams extends LoguxPatternParams = {}
> = {
  access: LoguxChannelAuthorizer<Action, PatternParams>
  filter?: LoguxFilterCreator<Action, PatternParams>
  init?: LoguxInitialized<Action, PatternParams>
  finally?: LoguxSubscriptionFinally<Action, PatternParams>
}

/**
 * Basic Logux Server API without good UI. Use it only if you need
 * to create some special hacks on top of Logux Server.
 *
 * In most use cases you should use {@link Server}.
 *
 * ```js
 * const { BaseServer } = require('@logux/server')
 * class MyLoguxHack extends BaseServer {
 *   …
 * }
 * ```
 */
export class BaseServer {
  constructor(opts: LoguxBaseServerOptions)

  /**
   * Server options.
   *
   * ```js
   * console.log('Server options', server.options.subprotocol)
   * ```
   */
  options: LoguxBaseServerOptions

  /**
   * Function to show current server status.
   */
  reporter: LoguxBaseServerOptions['reporter'] | (() => void)

  /**
   * Production or development mode.
   *
   * ```js
   * if (server.env === 'development') {
   *   logDebugData()
   * }
   * ```
   */
  env: Required<LoguxBaseServerOptions['env']>

  /**
   * Server unique ID.
   *
   * ```js
   * console.log('Error was raised on ' + server.nodeId)
   * ```
   */
  nodeId: string

  /**
   * Server actions log.
   *
   * ```js
   * server.log.each(finder)
   * ```
   */
  log: Log

  /**
   * Connected clients.
   *
   * ```js
   * for (let i in server.connected) {
   *   console.log(server.connected[i].remoteAddress)
   * }
   * ```
   */
  connected: {
    [key: string]: ServerClient
  }

  /**
   * Set authenticate function. It will receive client credentials
   * and node ID. It should return a Promise with `true` or `false`.
   *
   * ```js
   * server.auth(async (userId, token) => {
   *   const user = await findUserByToken(token)
   *   return !!user && userId === user.id
   * })
   * ```
   *
   * @param authenticator The authentication callback.
   */
  auth(authenticator: LoguxAuthenticator): void

  /**
   * Start WebSocket server and listen for clients.
   *
   * @returns When the server has been bound.
   */
  listen(): Promise<void>

  /**
   * Subscribe for synchronization events. It implements nanoevents API.
   * Supported events:
   *
   * * `error`: server error during action processing.
   * * `fatal`: server error during loading.
   * * `clientError`: wrong client behaviour.
   * * `connected`: new client was connected.
   * * `disconnected`: client was disconnected.
   * * `preadd`: action is going to be added to the log.
   *   The best place to set `reasons`.
   * * `add`: action was added to the log.
   * * `clean`: action was cleaned from the log.
   * * `processed`: action processing was finished.
   * * `subscribed`: channel initial data was loaded.
   *
   * ```js
   * server.on('error', error => {
   *   trackError(error)
   * })
   * ```
   *
   * @param event The event name.
   * @param listener The listener function.
   * @returns Unbind listener from event.
   */
  on(event: 'fatal' | 'clientError', listener: (err: Error) => void): void
  on<Action extends UserAction = UserAction>(
    event: 'error',
    listener: (err: Error, action: Action, meta: ServerMeta) => void
  ): void
  on(
    event: 'connected' | 'disconnected',
    listener: (server: ServerClient) => void
  ): void
  on<Action extends LoguxAction | UserAction = UserAction>(
    event: 'preadd' | 'add' | 'clean',
    listener: (action: Action, meta: ServerMeta) => void
  ): void
  on<Action extends UserAction = UserAction>(
    event: 'processed',
    listener: (
      action: Action,
      meta: ServerMeta,
      latencyMilliseconds: number
    ) => void
  ): void
  on(
    event: 'subscribed',
    listener: (
      action: LoguxSubscribeAction,
      meta: ServerMeta,
      latencyMilliseconds: number
    ) => void
  ): void

  /**
   * Stop server and unbind all listeners.
   *
   * ```js
   * afterEach(() => {
   *   testServer.destroy()
   * })
   * ```
   *
   * @returns Promise when all listeners will be removed.
   */
  destroy(): Promise<void>

  /**
   * Define action type’s callbacks.
   *
   * ```js
   * server.type('CHANGE_NAME', {
   *   access (ctx, action, meta) {
   *     return action.user === ctx.userId
   *   },
   *   resend (ctx, action) {
   *     return { channel: `user/${ action.user }` }
   *   }
   *   process (ctx, action, meta) {
   *     if (isFirstOlder(lastNameChange(action.user), meta)) {
   *       return db.changeUserName({ id: action.user, name: action.name })
   *     }
   *   }
   * })
   * ```
   *
   * @param name The action’s type.
   * @param callbacks Callbacks for actions with this type.
   */
  type<Action extends UserAction = UserAction>(
    name: Action['type'],
    callbacks: LoguxActionCallbacks<Action>
  ): void

  /**
   * Define callbacks for actions, which type was not defined
   * by any {@link Server#type}. Useful for proxy or some hacks.
   *
   * Without this settings, server will call {@link Server#unknownType}
   * on unknown type.
   *
   * ```js
   * server.otherType(
   *   async access (ctx, action, meta) {
   *     const response = await phpBackend.checkByHTTP(action, meta)
   *     if (response.code === 404) {
   *       this.unknownType(action, meta)
   *       retur false
   *     } else {
   *       return response.body === 'granted'
   *     }
   *   }
   *   async process (ctx, action, meta) {
   *     return await phpBackend.sendHTTP(action, meta)
   *   }
   * })
   * ```
   *
   * @param callbacks Callbacks for actions with this type.
   */
  otherType<Action extends UserAction = UserAction>(
    callbacks: LoguxActionCallbacks<Action>
  ): void

  /**
   * Define the channel.
   *
   * ```js
   * server.channel('user/:id', {
   *   access (ctx, action, meta) {
   *     return ctx.params.id === ctx.userId
   *   }
   *   filter (ctx, action, meta) {
   *     return (otherCtx, otherAction, otherMeta) => {
   *       return !action.hidden
   *     }
   *   }
   *   async init (ctx, action, meta) {
   *     const user = await db.loadUser(ctx.params.id)
   *     ctx.sendBack({ type: 'USER_NAME', name: user.name })
   *   }
   * })
   * ```
   *
   * @param pattern Pattern or regular expression for channel name.
   * @param callbacks Callback during subscription process.
   */
  channel<
    Action extends UserAction = UserAction,
    PatternParams extends LoguxPatternParams = {}
  >(
    pattern: string | RegExp,
    callbacks: LoguxChannelCallbacks<Action, PatternParams>
  ): void

  /**
   * Set callbacks for unknown channel subscription.
   *
   *```js
   * server.otherChannel({
   *   async access (ctx, action, meta) {
   *     const res = await phpBackend.checkChannel(ctx.params[0], ctx.userId)
   *     if (res.code === 404) {
   *       this.wrongChannel(action, meta)
   *       return false
   *     } else {
   *       return response.body === 'granted'
   *     }
   *   }
   * })
   * ```
   *
   * @param callbacks Callback during subscription process.
   */
  otherChannel<
    Action extends UserAction = UserAction,
    PatternParams extends LoguxPatternParams = {}
  >(callbacks: LoguxChannelCallbacks<Action, PatternParams>): void

  /**
   * Undo action from client.
   *
   * ```js
   * if (couldNotFixConflict(action, meta)) {
   *   server.undo(meta)
   * }
   * ```
   *
   * @param meta The action’s metadata.
   * @param reason Optional code for reason. Default is `'error'`
   * @param extra Extra fields to `logux/undo` action.
   * @returns When action was saved to the log.
   */
  undo(meta: ServerMeta, reason?: string, extra?: Object): Promise<void>

  /**
   * Send runtime error stacktrace to all clients.
   *
   * ```js
   * process.on('uncaughtException', e => {
   *   server.debugError(e)
   * })
   * ```
   *
   * @param error Runtime error instance.
   */
  debugError(error: Error): void

  /**
   * Send action, received by other server, to all clients of current server.
   * This method is for multi-server configuration only.
   *
   * ```js
   * server.on('add', (action, meta) => {
   *   if (meta.server === server.nodeId) {
   *     sendToOtherServers(action, meta)
   *   }
   * })
   * onReceivingFromOtherServer((action, meta) => {
   *   server.sendAction(action, meta)
   * })
   * ```
   *
   * @param action New action.
   * @param meta Action’s metadata.
   */
  sendAction<Action extends UserAction = UserAction>(
    action: Action,
    meta: ServerMeta
  ): void

  /**
   * Add new client for server. You should call this method manually
   * mostly for test purposes.
   *
   * ```js
   * server.addClient(test.right)
   * ```
   *
   * @param connection Logux connection to client.
   * @returns Client ID.
   */
  addClient(connection: ServerConnection): number

  /**
   * If you receive action with unknown type, this method will mark this action
   * with `error` status and undo it on the clients.
   *
   * If you didn’t set {@link Server#otherType},
   * Logux will call it automatically.
   *
   * ```js
   * server.otherType({
   *   access (ctx, action, meta) {
   *     if (action.type.startsWith('myapp/')) {
   *       return proxy.access(action, meta)
   *     } else {
   *       server.unknownType(action, meta)
   *     }
   *   }
   * })
   * ```
   *
   * @param action The action with unknown type.
   * @param meta Action’s metadata.
   */
  unknownType<Action extends UserAction = UserAction>(
    action: Action,
    meta: ServerMeta
  ): void

  /**
   * Report that client try to subscribe for unknown channel.
   *
   * Logux call it automatically,
   * if you will not set {@link Server#otherChannel}.
   *
   * ```js
   * server.otherChannel({
   *   async access (ctx, action, meta) {
   *     const res = phpBackend.checkChannel(params[0], ctx.userId)
   *     if (res.code === 404) {
   *       this.wrongChannel(action, meta)
   *       return false
   *     } else {
   *       return response.body === 'granted'
   *     }
   *   }
   * })
   * ```
   *
   * @param action The subscribe action.
   * @param meta Action’s metadata.
   */
  wrongChannel<Action extends UserAction = UserAction>(
    action: Action,
    meta: ServerMeta
  ): void
}
