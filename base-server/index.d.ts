import {
  Action,
  AnyAction,
  ID,
  Log,
  Meta,
  ServerConnection,
  LogStore,
  TestTime
} from '@logux/core'
import { Unsubscribe } from 'nanoevents'
import { Server as HTTPServer } from 'http'

import Context, { ChannelContext } from '../context'
import ServerClient from '../server-client'

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
   * All clients subscribed to listed channels will receive the action.
   */
  channels?: string[]

  /**
   * All clients subscribed to channel will receive the action.
   */
  channel?: string

  /**
   * All clients with listed user IDs will receive the action.
   */
  users?: string[]

  /**
   * All clients with listed user ID will receive the action.
   */
  user?: string

  /**
   * All clients with listed client IDs will receive the action.
   */
  clients?: string[]

  /**
   * All clients with listed client ID will receive the action.
   */
  client?: string

  /**
   * All clients with listed node IDs will receive the action.
   */
  nodes?: string[]

  /**
   * Client with listed node ID will receive the action.
   */
  node?: string
}

export type BaseServerOptions = {
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
   * Secret to control the server.
   */
  controlSecret?: string

  /**
   * CIDR masks for IP address, where control requests could came from.
   */
  controlMask?: string

  /**
   * Store to save log. Will be {@link @logux/core:MemoryStore}, by default.
   */
  store?: LogStore

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
  key?: string | { pem: string }

  /**
   * SSL certificate or path to it. Path could be relative from server
   * root. It is required in production mode, because WSS is highly
   * recommended.
   */
  cert?: string
}

export type LoguxSubscribeAction = {
  type: 'logux/subscribe'
  channel: string
  since?: {
    id: string
    time: number
  }
}

export type LoguxAnySubscribeAction = LoguxSubscribeAction & {
  [key: string]: any
}

export type LoguxUnsubscribeAction = {
  type: 'logux/unsubscribe'
  channel: string
}

export type LoguxProcessedAction = {
  type: 'logux/processed'
  id: ID
}

export type LoguxUndoAction = {
  type: 'logux/undo'
  id: ID
  reason?: string
}

export type LoguxAction =
  | LoguxSubscribeAction
  | LoguxUnsubscribeAction
  | LoguxProcessedAction
  | LoguxUndoAction

export type AuthenticatorOptions<H extends object> = {
  headers: H
  client: ServerClient
  userId: string
  cookie: { [name: string]: string }
  token: string
}

/**
 * The authentication callback.
 *
 * @param userId User ID.
 * @param token The client credentials.
 * @param client Client object.
 * @returns `true` if credentials was correct
 */
interface Authenticator<H extends object> {
  (user: AuthenticatorOptions<H>): boolean | Promise<boolean>
}

/**
 * Check does user can do this action.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns `true` if client are allowed to use this action.
 */
interface Authorizer<A extends Action, D extends object, H extends object> {
  (ctx: Context<D, H>, action: A, meta: ServerMeta): boolean | Promise<boolean>
}

/**
 * Return object with keys for meta to resend action to other users.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Meta’s keys.
 */
interface Resender<A extends Action, D extends object, H extends object> {
  (ctx: Context<D, H>, action: A, meta: ServerMeta): Resend | Promise<Resend>
}

/**
 * Action business logic.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Promise when processing will be finished.
 */
interface Processor<A extends Action, D extends object, H extends object> {
  (ctx: Context<D, H>, action: A, meta: ServerMeta): void | Promise<void>
}

/**
 * Callback which will be run on the end of action/subscription
 * processing or on an error.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 */
interface ActionFinally<A extends Action, D extends object, H extends object> {
  (ctx: Context<D, H>, action: A, meta: ServerMeta): void
}

/**
 * Channel filter callback
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Should action be sent to client.
 */
interface ChannelFilter<H extends object> {
  (ctx: Context<{}, H>, action: Action, meta: ServerMeta): boolean
}

/**
 * Channel authorizer callback
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns `true` if client are allowed to subscribe to this channel.
 */
interface ChannelAuthorizer<
  A extends Action,
  D extends object,
  P extends object | string[],
  H extends object
> {
  (ctx: ChannelContext<D, P, H>, action: A, meta: ServerMeta):
    | boolean
    | Promise<boolean>
}

/**
 * Generates custom filter for channel’s actions.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Actions filter.
 */
interface FilterCreator<
  A extends Action,
  D extends object,
  P extends object | string[],
  H extends object
> {
  (ctx: ChannelContext<D, P, H>, action: A, meta: ServerMeta):
    | Promise<ChannelFilter<H>>
    | ChannelFilter<H>
    | void
}

/**
 * Send actions with current state.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Promise during current actions loading.
 */
interface ChannelLoader<
  A extends Action,
  D extends object,
  P extends object | string[],
  H extends object
> {
  (ctx: ChannelContext<D, P, H>, action: A, meta: ServerMeta): void | Promise<
    void
  >
}

/**
 * Callback which will be run on the end of subscription
 * processing or on an error.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 */
interface ChannelFinally<
  A extends Action,
  D extends object,
  P extends object | string[],
  H extends object
> {
  (ctx: ChannelContext<D, P, H>, action: A, meta: ServerMeta): void
}

type ActionCallbacks<A extends Action, D extends object, H extends object> = {
  access: Authorizer<A, D, H>
  resend?: Resender<A, D, H>
  process?: Processor<A, D, H>
  finally?: ActionFinally<A, D, H>
}

type ChannelCallbacks<
  A extends Action,
  D extends object,
  P extends object | string[],
  H extends object
> = {
  access: ChannelAuthorizer<A, D, P, H>
  filter?: FilterCreator<A, D, P, H>
  load?: ChannelLoader<A, D, P, H>
  finally?: ChannelFinally<A, D, P, H>
}

type ActionReporter = {
  action: Action
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

type ReportersArguments = {
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
    type: string
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
    controlSecret: string
    controlMask: string
    loguxServer: string
    environment: 'production' | 'development'
    subprotocol: string
    supports: string
    backend: string
    server: boolean
    nodeId: string
    redis: string
    notes: object
    cert: boolean
    host: string
    port: string
  }
}

export type Reporter = <E extends keyof ReportersArguments>(
  event: E,
  payload: ReportersArguments[E]
) => void

export type Resend = {
  channel?: string
  channels?: string[]
  user?: string
  users?: string[]
  client?: string
  clients?: string[]
  node?: string
  nodes?: string[]
}

export type Logger = {
  info(details: object, message: string): void
  warn(details: object, message: string): void
  error(details: object, message: string): void
  fatal(details: object, message: string): void
}

interface ActionCreator {
  (...args: any): Action
  toString(): string
}

type Response = {
  header?: {
    [name: string]: string
  }
  body: string
}

type GetProcessor = {
  safe?: boolean
  request(request: object): Response
}

type PostProcessor = {
  isValid(command: object): false
  command(command: object, request: object): Promise<void>
}

/**
 * Base server class to extend.
 */
export default class BaseServer<
  H extends object = {},
  L extends Log = Log<ServerMeta>
> {
  /**
   * @param opts Server options.
   */
  constructor (opts: BaseServerOptions)

  /**
   * Server options.
   *
   * ```js
   * console.log('Server options', server.options.subprotocol)
   * ```
   */
  options: BaseServerOptions

  /**
   * Function to show current server status.
   */
  reporter: Reporter

  /**
   * Production or development mode.
   *
   * ```js
   * if (server.env === 'development') {
   *   logDebugData()
   * }
   * ```
   */
  env: 'production' | 'development'

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
  log: L

  /**
   * Connected clients.
   *
   * ```js
   * for (let client of server.connected.values()) {
   *   console.log(client.remoteAddress)
   * }
   * ```
   */
  connected: Map<string, ServerClient>

  /**
   * Connected client by client ID.
   *
   * Do not rely on this data, when you have multiple Logux servers.
   * Each server will have a different list.
   */
  clientIds: Map<string, ServerClient>

  /**
   * Connected client by node ID.
   *
   * Do not rely on this data, when you have multiple Logux servers.
   * Each server will have a different list.
   */
  nodeIds: Map<string, ServerClient>

  /**
   * Connected client by user ID.
   *
   * Do not rely on this data, when you have multiple Logux servers.
   * Each server will have a different list.
   */
  userIds: Map<string, ServerClient[]>

  /**
   * Clients subscribed to some channel.
   *
   * Do not rely on this data, when you have multiple Logux servers.
   * Each server will have a different list.
   */
  subscribers: {
    [channel: string]: {
      [nodeId: string]: ChannelFilter<{}> | true
    }
  }

  /**
   * Add callback to internal HTTP server.
   */
  controls: {
    [path: string]: GetProcessor | PostProcessor
  }

  /**
   * Set authenticate function. It will receive client credentials
   * and node ID. It should return a Promise with `true` or `false`.
   *
   * ```js
   * server.auth(async ({ userId, token }) => {
   *   const user = await findUserByToken(token)
   *   return !!user && userId === user.id
   * })
   * ```
   *
   * @param authenticator The authentication callback.
   */
  auth (authenticator: Authenticator<H>): void

  /**
   * Start WebSocket server and listen for clients.
   *
   * @returns When the server has been bound.
   */
  listen (): Promise<void>

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
  on (
    event: 'fatal' | 'clientError',
    listener: (err: Error) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Error listener.
   */
  on (
    event: 'error',
    listener: (err: Error, action: Action, meta: ServerMeta) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Client listener.
   */
  on (
    event: 'connected' | 'disconnected',
    listener: (client: ServerClient) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Client listener.
   */
  on (
    event: 'authenticated',
    listener: (client: ServerClient, latencyMilliseconds: number) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Action listener.
   */
  on (
    event: 'preadd' | 'add' | 'clean' | 'backendSent',
    listener: (action: Action, meta: ServerMeta) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Processing listener.
   */
  on (
    event: 'processed' | 'backendGranted' | 'backendProcessed',
    listener: (
      action: Action,
      meta: ServerMeta,
      latencyMilliseconds: number
    ) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Subscription listener.
   */
  on (
    event: 'subscribed',
    listener: (
      action: LoguxSubscribeAction,
      meta: ServerMeta,
      latencyMilliseconds: number
    ) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Event listener.
   */
  on (event: 'subscriptionCancelled', listener: () => void): Unsubscribe

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
  destroy (): Promise<void>

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
   *
   * @template A Action’s type.
   * @template D Type for `ctx.data`.
   */
  type<A extends Action = AnyAction, D extends object = {}> (
    name: A['type'],
    callbacks: ActionCallbacks<A, D, H>
  ): void

  type<AC extends ActionCreator, D extends object = {}> (
    actionCreator: AC,
    callbacks: ActionCallbacks<ReturnType<AC>, D, H>
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
   *       return false
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
   *
   * @template D Type for `ctx.data`.
   */
  otherType<D extends object = {}> (
    callbacks: ActionCallbacks<Action, D, H>
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
   *   async load (ctx, action, meta) {
   *     const user = await db.loadUser(ctx.params.id)
   *     ctx.sendBack({ type: 'USER_NAME', name: user.name })
   *   }
   * })
   * ```
   *
   * @param pattern Pattern for channel name.
   * @param callbacks Callback during subscription process.
   *
   * @template P Type for `ctx.params`.
   * @template D Type for `ctx.data`.
   * @template A `logux/subscribe` Action’s type.
   */
  channel<
    P extends object = {},
    D extends object = {},
    A extends LoguxSubscribeAction = LoguxSubscribeAction
  > (pattern: string, callbacks: ChannelCallbacks<A, D, P, H>): void

  /**
   * @param pattern Regular expression for channel name.
   * @param callbacks Callback during subscription process.
   */
  channel<
    P extends string[] = string[],
    D extends object = {},
    A extends LoguxSubscribeAction = LoguxSubscribeAction
  > (pattern: RegExp, callbacks: ChannelCallbacks<A, D, P, H>): void

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
   *
   * @template D Type for `ctx.data`.
   * @template A `logux/subscribe` Action’s type.
   */
  otherChannel<D extends object = {}> (
    callbacks: ChannelCallbacks<LoguxSubscribeAction, D, [string], H>
  ): void

  /**
   * Add new action to the server and return the Promise until it will be
   * resend to clients and processed.
   *
   * @param action New action to resend and process.
   * @param meta Action’s meta.
   * @returns Promise until new action will be resend to clients and processed.
   */
  process (action: Action, meta?: Partial<ServerMeta>): Promise<ServerMeta>

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
  undo (meta: ServerMeta, reason?: string, extra?: object): Promise<void>

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
  debugError (error: Error): void

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
  sendAction (action: Action, meta: ServerMeta): void

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
  addClient (connection: ServerConnection): number

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
  unknownType (action: Action, meta: ServerMeta): void

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
  wrongChannel (action: LoguxSubscribeAction, meta: ServerMeta): void
}
