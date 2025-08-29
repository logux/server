import type {
  AbstractActionCreator,
  LoguxSubscribeAction,
  LoguxUnsubscribeAction
} from '@logux/actions'
import type {
  Action,
  AnyAction,
  ID,
  Log,
  LogStore,
  Meta,
  ServerConnection,
  TestTime
} from '@logux/core'
import type { Unsubscribe } from 'nanoevents'
import type {
  Server as HTTPServer,
  IncomingMessage,
  ServerResponse
} from 'node:http'

import type {
  ChannelContext,
  ConnectContext,
  Context
} from '../context/index.js'
import type { ServerClient } from '../server-client/index.js'

interface LogFn {
  (...objs: unknown[]): void
}

interface TypeOptions {
  /**
   * Name of the queue that will be used to process actions
   * of the specified type. Default is 'main'
   */
  queue?: string
}

interface ChannelOptions {
  /**
   * Name of the queue that will be used to process channels
   * with the specified name pattern. Default is 'main'
   */
  queue?: string
}

interface ConnectLoader<Headers extends object = unknown> {
  (
    ctx: ConnectContext<Headers>,
    lastSynced: number
  ):
    | [Action, ServerMeta][]
    | Promise<
        [
          Action,
          Partial<Pick<ServerMeta, 'subprotocol'>> &
            Pick<ServerMeta, 'id' | 'time'>
        ][]
      >
}

type ServerNodeConstructor = new (...args: any[]) => ServerNode

export interface ServerMeta extends Meta {
  /**
   * All nodes subscribed to channel will receive the action.
   */
  channel?: string

  /**
   * All nodes subscribed to listed channels will receive the action.
   */
  channels?: string[]

  /**
   * All nodes with listed client ID will receive the action.
   */
  client?: string

  /**
   * All nodes with listed client IDs will receive the action.
   */
  clients?: string[]

  /**
   * Client IDs, which will not receive the action.
   */
  excludeClients?: string[]

  /**
   * Node with listed node ID will receive the action.
   */
  node?: string

  /**
   * All nodes with listed node IDs will receive the action.
   */
  nodes?: string[]

  /**
   * Node ID of the server received the action.
   */
  server: string

  /**
   * Action processing status
   */
  status?: 'error' | 'processed' | 'waiting'

  /**
   * All nodes with listed user ID will receive the action.
   */
  user?: string

  /**
   * All nodes with listed user IDs will receive the action.
   */
  users?: string[]
}

export interface BaseServerOptions {
  /**
   * SSL certificate or path to it. Path could be relative from server
   * root. It is required in production mode, because WSS is highly
   * recommended.
   */
  cert?: string

  /**
   * Regular expression which should be cleaned from error message and stack.
   *
   * By default it cleans `Bearer [^\s"]+`.
   */
  cleanFromLog?: RegExp

  /**
   * Disable health check endpoint, {@link Server#http}.
   *
   * The server will process only WebSocket connection and ignore all other
   * HTTP request (so they can be processed by other HTTP server).
   */
  disableHttpServer?: boolean

  /**
   * Development or production server mode. By default,
   * it will be taken from `NODE_ENV` environment variable.
   * On empty `NODE_ENV` it will be `'development'`.
   */
  env?: 'development' | 'production'

  /**
   * URL of main JS file in the root dir for the cases where you can’t use
   * `import.meta.dirname`.
   *
   * ```
   * fileUrl: import.meta.url
   * ```
   */
  fileUrl?: string

  /**
   * IP-address to bind server. Default is `127.0.0.1`.
   */
  host?: string

  /**
   * Custom random ID to be used in node ID.
   */
  id?: string

  /**
   * SSL key or path to it. Path could be relative from server root.
   * It is required in production mode, because WSS is highly recommended.
   */
  key?: { pem: string } | string

  /**
   * The version requirements for client subprotocol version.
   */
  minSubprotocol?: number

  /**
   * Replace class for ServerNode.
   */
  Node?: ServerNodeConstructor

  /**
   * Process ID, to display in logs.
   */
  pid?: number

  /**
   * Milliseconds since last message to test connection by sending ping.
   * Default is `20000`.
   */
  ping?: number

  /**
   * Port to bind server. It will create HTTP server manually to connect
   * WebSocket server to it. Default is `31337`.
   */
  port?: number | string

  /**
   * URL to Redis for Logux Server Pro scaling.
   */
  redis?: string

  /**
   * Application root to load files and show errors.
   * Default is `process.cwd()`.
   *
   * ```js
   * root: import.meta.dirname
   * ```
   */
  root?: string

  /**
   * HTTP server to serve Logux’s WebSocket and HTTP requests.
   *
   * Logux will remove previous HTTP callbacks. Do not use it with Express.js
   * or other HTTP servers with defined routes.
   */
  server?: HTTPServer

  /**
   * Store to save log. Will be {@link @logux/core:MemoryStore}, by default.
   */
  store?: LogStore

  /**
   * Server current application subprotocol version.
   */
  subprotocol?: number

  /**
   * Test time to test server.
   */
  time?: TestTime

  /**
   * Timeout in milliseconds to disconnect connection.
   * Default is `70000`.
   */
  timeout?: number
}

export interface AuthenticatorOptions<Headers extends object> {
  client: ServerClient
  cookie: Record<string, string>
  headers: Headers
  token: string
  userId: string
}

export type SendBackActions =
  | [Action, Partial<Meta>][]
  | Action
  | Action[]
  | void

/**
 * The authentication callback.
 *
 * @param userId User ID.
 * @param token The client credentials.
 * @param client Client object.
 * @returns `true` if credentials was correct
 */
interface ServerAuthenticator<Headers extends object> {
  (user: AuthenticatorOptions<Headers>): boolean | Promise<boolean>
}

/**
 * Check does user can do this action.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns `true` if client are allowed to use this action.
 */
interface Authorizer<
  TypeAction extends Action,
  Data extends object,
  Headers extends object
> {
  (
    ctx: Context<Data, Headers>,
    action: Readonly<TypeAction>,
    meta: Readonly<ServerMeta>
  ): boolean | Promise<boolean>
}

/**
 * Return object with keys for meta to resend action to other users.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Meta’s keys.
 */
interface Resender<
  TypeAction extends Action,
  Data extends object,
  Headers extends object
> {
  (
    ctx: Context<Data, Headers>,
    action: Readonly<TypeAction>,
    meta: Readonly<ServerMeta>
  ): Promise<Resend> | Resend
}

/**
 * Action business logic.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Promise when processing will be finished.
 */
interface Processor<
  TypeAction extends Action,
  Data extends object,
  Headers extends object
> {
  (
    ctx: Context<Data, Headers>,
    action: Readonly<TypeAction>,
    meta: Readonly<ServerMeta>
  ): Promise<void> | void
}

/**
 * Callback which will be run on the end of action/subscription
 * processing or on an error.
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 */
interface ActionFinally<
  TypeAction extends Action,
  Data extends object,
  Headers extends object
> {
  (
    ctx: Context<Data, Headers>,
    action: Readonly<TypeAction>,
    meta: Readonly<ServerMeta>
  ): void
}

/**
 * Channel filter callback
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 * @returns Should action be sent to client.
 */
interface ChannelFilter<Headers extends object> {
  (
    ctx: Context<unknown, Headers>,
    action: Readonly<Action>,
    meta: Readonly<ServerMeta>
  ): boolean | Promise<boolean>
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
  SubscribeAction extends Action,
  Data extends object,
  ChannelParams extends object | string[],
  Headers extends object
> {
  (
    ctx: ChannelContext<Data, ChannelParams, Headers>,
    action: Readonly<SubscribeAction>,
    meta: Readonly<ServerMeta>
  ): boolean | Promise<boolean>
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
  SubscribeAction extends Action,
  Data extends object,
  ChannelParams extends object | string[],
  Headers extends object
> {
  (
    ctx: ChannelContext<Data, ChannelParams, Headers>,
    action: Readonly<SubscribeAction>,
    meta: Readonly<ServerMeta>
  ): ChannelFilter<Headers> | Promise<ChannelFilter<Headers>> | void
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
  SubscribeAction extends Action,
  Data extends object,
  ChannelParams extends object | string[],
  Headers extends object
> {
  (
    ctx: ChannelContext<Data, ChannelParams, Headers>,
    action: Readonly<SubscribeAction>,
    meta: Readonly<ServerMeta>
  ): Promise<SendBackActions> | SendBackActions
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
  SubscribeAction extends Action,
  Data extends object,
  ChannelParams extends object | string[],
  Headers extends object
> {
  (
    ctx: ChannelContext<Data, ChannelParams, Headers>,
    action: Readonly<SubscribeAction>,
    meta: Readonly<ServerMeta>
  ): void
}

/**
 * Callback which will be called on listener unsubscribe
 * (with explicit intent or because of disconnect)
 *
 * @param ctx Information about node, who create this action.
 * @param action The action data.
 * @param meta The action metadata.
 */
interface ChannelUnsubscribe<
  Data extends object,
  ChannelParams extends object | string[],
  Headers extends object
> {
  (
    ctx: ChannelContext<Data, ChannelParams, Headers>,
    action: LoguxUnsubscribeAction,
    meta: Readonly<ServerMeta>
  ): void
}

type ActionCallbacks<
  TypeAction extends Action,
  Data extends object,
  Headers extends object
> = {
  finally?: ActionFinally<TypeAction, Data, Headers>
  resend?: Resender<TypeAction, Data, Headers>
} & (
  | {
      access: Authorizer<TypeAction, Data, Headers>
      process?: Processor<TypeAction, Data, Headers>
    }
  | {
      accessAndProcess: Processor<TypeAction, Data, Headers>
    }
)

type ChannelCallbacks<
  SubscribeAction extends Action,
  Data extends object,
  ChannelParams extends object | string[],
  Headers extends object
> = {
  filter?: FilterCreator<SubscribeAction, Data, ChannelParams, Headers>
  finally?: ChannelFinally<SubscribeAction, Data, ChannelParams, Headers>
  unsubscribe?: ChannelUnsubscribe<Data, ChannelParams, Headers>
} & (
  | {
      access: ChannelAuthorizer<SubscribeAction, Data, ChannelParams, Headers>
      load?: ChannelLoader<SubscribeAction, Data, ChannelParams, Headers>
    }
  | {
      accessAndLoad: ChannelLoader<
        SubscribeAction,
        Data,
        ChannelParams,
        Headers
      >
    }
)

interface ActionReporter {
  action: Readonly<Action>
  meta: Readonly<ServerMeta>
}

interface SubscriptionReporter {
  actionId: ID
  channel: string
}

interface CleanReporter {
  actionId: ID
}

interface AuthenticationReporter {
  connectionId: string
  nodeId: string
  subprotocol: string
}

interface ReportersArguments {
  add: ActionReporter
  addClean: ActionReporter
  authenticated: AuthenticationReporter
  clean: CleanReporter
  clientError: {
    connectionId?: string
    err: Error
    nodeId?: string
  }
  connect: {
    connectionId: string
    ipAddress: string
  }
  denied: CleanReporter
  destroy: void
  disconnect: {
    connectionId?: string
    nodeId?: string
  }
  error: {
    actionId?: ID
    connectionId?: string
    err: Error
    fatal?: true
    nodeId?: string
  }
  listen: {
    cert: boolean
    environment: 'development' | 'production'
    host: string
    loguxServer: string
    minSubprotocol: number
    nodeId: string
    notes: object
    port: string
    redis: string
    server: boolean
    subprotocol: number
  }
  processed: {
    actionId: ID
    latency: number
  }
  subscribed: SubscriptionReporter
  unauthenticated: AuthenticationReporter
  unknownType: {
    actionId: ID
    type: string
  }
  unsubscribed: SubscriptionReporter
  useless: ActionReporter
  wrongChannel: SubscriptionReporter
  zombie: {
    nodeId: string
  }
}

export interface Reporter {
  <Event extends keyof ReportersArguments>(
    event: Event,
    payload: ReportersArguments[Event]
  ): void
}

export type Resend =
  | {
      channel?: string
      channels?: string[]
      client?: string
      clients?: string[]
      excludeClients?: string[]
      node?: string
      nodes?: string[]
      user?: string
      users?: string[]
    }
  | string
  | string[]

export interface Logger {
  debug(details: object, message: string): void
  error(details: object, message: string): void
  fatal(details: object, message: string): void
  info(details: object, message: string): void
  warn(details: object, message: string): void
}

/**
 * Return `false` if `cb()` got response error with 403.
 *
 * ```js
 * import { wasNot403 } from '@logux/server'
 *
 * server.auth(({ userId, token }) => {
 *   return wasNot403(async () => {
 *     get(`/checkUser/${userId}/${token}`)
 *   })
 * })
 * ```
 *
 * @param cb Callback with `request` calls.
 */
export function wasNot403(cb: () => Promise<void>): Promise<boolean>

/**
 * Base server class to extend.
 */
export class BaseServer<
  Headers extends object = unknown,
  ServerLog extends Log = Log<ServerMeta>
> {
  /**
   * Connected client by client ID.
   *
   * Do not rely on this data, when you have multiple Logux servers.
   * Each server will have a different list.
   */
  clientIds: Map<string, ServerClient>

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
   * Production or development mode.
   *
   * ```js
   * if (server.env === 'development') {
   *   logDebugData()
   * }
   * ```
   */
  env: 'development' | 'production'

  /**
   * Server actions log.
   *
   * ```js
   * server.log.each(finder)
   * ```
   */
  log: ServerLog

  /**
   * Console for custom log records. It uses `pino` API.
   *
   * ```js
   * server.on('connected', client => {
   *   server.logger.info(
   *     { domain: client.httpHeaders.domain },
   *     'Client domain'
   *   )
   * })
   * ```
   */
  logger: {
    debug: LogFn
    error: LogFn
    fatal: LogFn
    info: LogFn
    warn: LogFn
  }

  /**
   * Server unique ID.
   *
   * ```js
   * console.log('Error was raised on ' + server.nodeId)
   * ```
   */
  nodeId: string

  /**
   * Connected client by node ID.
   *
   * Do not rely on this data, when you have multiple Logux servers.
   * Each server will have a different list.
   */
  nodeIds: Map<string, ServerClient>

  /**
   * Server options.
   *
   * ```js
   * console.log('Server options', server.options.subprotocol)
   * ```
   */
  options: BaseServerOptions

  /**
   * Clients subscribed to some channel.
   *
   * Do not rely on this data, when you have multiple Logux servers.
   * Each server will have a different list.
   */
  subscribers: {
    [channel: string]: {
      [nodeId: string]: {
        filters: Record<string, ChannelFilter<unknown> | true>
        unsubscribe?: (action: LoguxUnsubscribeAction, meta: ServerMeta) => void
      }
    }
  }

  /**
   * Connected client by user ID.
   *
   * Do not rely on this data, when you have multiple Logux servers.
   * Each server will have a different list.
   */
  userIds: Map<string, ServerClient[]>

  /**
   * @param opts Server options.
   */
  constructor(opts: BaseServerOptions)

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
   * Set authenticate function. It will receive client credentials
   * and node ID. It should return a Promise with `true` or `false`.
   *
   * ```js
   * server.auth(async ({ userId, cookie }) => {
   *   const user = await findUserByToken(cookie.token)
   *   return !!user && userId === user.id
   * })
   * ```
   *
   * @param authenticator The authentication callback.
   */
  auth(authenticator: ServerAuthenticator<Headers>): void

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
   * @param options Additional options
   */
  channel<
    ChannelParams extends object = unknown,
    Data extends object = unknown,
    SubscribeAction extends LoguxSubscribeAction = LoguxSubscribeAction
  >(
    pattern: string,
    callbacks: ChannelCallbacks<SubscribeAction, Data, ChannelParams, Headers>,
    options?: ChannelOptions
  ): void
  /**
   * @param pattern Regular expression for channel name.
   * @param callbacks Callback during subscription process.
   * @param options Additional options
   */
  channel<
    ChannelParams extends string[] = string[],
    Data extends object = unknown,
    SubscribeAction extends LoguxSubscribeAction = LoguxSubscribeAction
  >(
    pattern: RegExp,
    callbacks: ChannelCallbacks<SubscribeAction, Data, ChannelParams, Headers>,
    options?: ChannelOptions
  ): void

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
   * Add non-WebSocket HTTP request processor.
   *
   * ```js
   * server.http('GET', '/auth', (req, res) => {
   *   let token = signIn(req)
   *   if (token) {
   *     res.setHeader('Set-Cookie', `token=${token}; Secure; HttpOnly`)
   *     res.end()
   *   } else {
   *     res.statusCode = 400
   *     res.end('Wrong user or password')
   *   }
   * })
   * ```
   */
  http(
    method: string,
    url: string,
    listener: (
      req: IncomingMessage,
      res: ServerResponse
    ) => Promise<void> | void
  ): void
  http(
    listener: (
      req: IncomingMessage,
      res: ServerResponse
    ) => boolean | Promise<boolean>
  ): void

  /**
   * Start WebSocket server and listen for clients.
   *
   * @returns When the server has been bound.
   */
  listen(): Promise<void>

  /**
   * @param event The event name.
   * @param listener Event listener.
   */
  on(event: 'subscriptionCancelled', listener: () => void): Unsubscribe
  /**
   * @param event The event name.
   * @param listener Subscription listener.
   */
  on(
    event: 'subscribing',
    listener: (action: LoguxSubscribeAction, meta: Readonly<ServerMeta>) => void
  ): Unsubscribe
  /**
   * @param event The event name.
   * @param listener Processing listener.
   */
  on(
    event: 'processed',
    listener: (
      action: Action,
      meta: Readonly<ServerMeta>,
      latencyMilliseconds: number
    ) => void
  ): Unsubscribe
  /**
   * @param event The event name.
   * @param listener Action listener.
   */
  on(
    event: 'add' | 'clean',
    listener: (action: Action, meta: Readonly<ServerMeta>) => void
  ): Unsubscribe
  /**
   * @param event The event name.
   * @param listener Client listener.
   */
  on(
    event: 'connected' | 'disconnected',
    listener: (client: ServerClient) => void
  ): Unsubscribe
  /**
   * Subscribe for synchronization events. It implements nanoevents API.
   * Supported events:
   *
   * * `error`: server error during action processing.
   * * `fatal`: server error during loading.
   * * `clientError`: wrong client behaviour.
   * * `connected`: new client was connected.
   * * `disconnected`: client was disconnected.
   * * `authenticated`: client was authenticated.
   * * `preadd`: action is going to be added to the log.
   *   The best place to set `reasons`.
   * * `add`: action was added to the log.
   * * `clean`: action was cleaned from the log.
   * * `processed`: action processing was finished.
   * * `subscribed`: channel initial data was loaded.
   * * `subscribing`: channel initial data started to be loaded.
   * * `unsubscribed`: node was unsubscribed.
   * * `subscriptionCancelled`: subscription was cancelled because the client
   *    is not connected.
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
  on(
    event: 'clientError' | 'fatal',
    listener: (err: Error) => void
  ): Unsubscribe
  /**
   * @param event The event name.
   * @param listener Error listener.
   */
  on(
    event: 'error',
    listener: (err: Error, action: Action, meta: Readonly<ServerMeta>) => void
  ): Unsubscribe
  /**
   * @param event The event name.
   * @param listener Client listener.
   */
  on(
    event: 'authenticated' | 'unauthenticated',
    listener: (client: ServerClient, latencyMilliseconds: number) => void
  ): Unsubscribe
  /**
   * @param event The event name.
   * @param listener Action listener.
   */
  on(
    event: 'preadd',
    listener: (action: Action, meta: ServerMeta) => void
  ): Unsubscribe
  /**
   * @param event The event name.
   * @param listener Subscription listener.
   */
  on(
    event: 'subscribed',
    listener: (
      action: LoguxSubscribeAction,
      meta: Readonly<ServerMeta>,
      latencyMilliseconds: number
    ) => void
  ): Unsubscribe
  /**
   * @param event The event name.
   * @param listener Subscription listener.
   */
  on(
    event: 'unsubscribed',
    listener: (
      action: LoguxUnsubscribeAction,
      meta: Readonly<ServerMeta>,
      clientNodeId: string
    ) => void
  ): Unsubscribe
  /**
   * @param event The event name.
   * @param listener Report listener.
   */
  on(event: 'report', listener: Reporter): Unsubscribe

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
  otherChannel<Data extends object = unknown>(
    callbacks: ChannelCallbacks<LoguxSubscribeAction, Data, [string], Headers>
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
   */
  otherType<Data extends object = unknown>(
    callbacks: ActionCallbacks<Action, Data, Headers>
  ): void

  /**
   * Add new action to the server and return the Promise until it will be
   * resend to clients and processed.
   *
   * @param action New action to resend and process.
   * @param meta Action’s meta.
   * @returns Promise until new action will be resend to clients and processed.
   */
  process(
    action: AnyAction,
    meta?: Partial<ServerMeta>
  ): Promise<Readonly<ServerMeta>>

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
  sendAction(action: Action, meta: ServerMeta): Promise<void> | void

  /**
   * Change a way how server loads actions history for the client.
   *
   * ```js
   * server.sendOnConnect(async (ctx, lastSynced) => {
   *   return db.loadActions({ user: ctx.userId, after: lastSynced })
   * })
   * ```
   *
   * @param loader Callback which loads list of actions and meta.
   */
  sendOnConnect(loader: ConnectLoader<Headers>)

  /**
   * Send `logux/subscribed` if client was not already subscribed.
   *
   * ```js
   * server.subscribe(ctx.nodeId, `users/${loaded}`)
   * ```
   *
   * @param nodeId Node ID.
   * @param channel Channel name.
   */
  subscribe(nodeId: string, channel: string): void

  /**
   * @param actionCreator Action creator function.
   * @param callbacks Callbacks for action created by creator.
   * @param options Additional options
   */
  type<Creator extends AbstractActionCreator, Data extends object = unknown>(
    actionCreator: Creator,
    callbacks: ActionCallbacks<ReturnType<Creator>, Data, Headers>,
    options?: TypeOptions
  ): void
  /**
   * Define action type’s callbacks.
   *
   * ```js
   * server.type('CHANGE_NAME', {
   *   access (ctx, action, meta) {
   *     return action.user === ctx.userId
   *   },
   *   resend (ctx, action) {
   *     return `user/${ action.user }`
   *   }
   *   process (ctx, action, meta) {
   *     if (isFirstOlder(lastNameChange(action.user), meta)) {
   *       return db.changeUserName({ id: action.user, name: action.name })
   *     }
   *   }
   * })
   * ```
   *
   * @param name The action’s type or action’s type matching rule as RegExp..
   * @param callbacks Callbacks for actions with this type.
   * @param options Additional options
   */
  type<TypeAction extends Action = AnyAction, Data extends object = unknown>(
    name: RegExp | TypeAction['type'],
    callbacks: ActionCallbacks<TypeAction, Data, Headers>,
    options?: TypeOptions
  ): void

  /**
   * Undo action from client.
   *
   * ```js
   * if (couldNotFixConflict(action, meta)) {
   *   server.undo(action, meta)
   * }
   * ```
   *
   * @param action The original action to undo.
   * @param meta The action’s metadata.
   * @param reason Optional code for reason. Default is `'error'`.
   * @param extra Extra fields to `logux/undo` action.
   * @returns When action was saved to the log.
   */
  undo(
    action: Action,
    meta: ServerMeta,
    reason?: string,
    extra?: object
  ): Promise<void>

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
  unknownType(action: Action, meta: ServerMeta): void

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
  wrongChannel(action: LoguxSubscribeAction, meta: ServerMeta): void
}
