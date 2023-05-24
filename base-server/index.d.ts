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
import { Server as HTTPServer, ServerResponse, IncomingMessage } from 'http'
import {
  LoguxUnsubscribeAction,
  AbstractActionCreator,
  LoguxSubscribeAction
} from '@logux/actions'
import { Unsubscribe } from 'nanoevents'
import { LogFn } from 'pino'

import { Context, ChannelContext } from '../context/index.js'
import { ServerClient } from '../server-client/index.js'

export interface ServerMeta extends Meta {
  /**
   * Action processing status
   */
  status?: 'waiting' | 'processed' | 'error'

  /**
   * Node ID of the server received the action.
   */
  server: string

  /**
   * All nodes subscribed to listed channels will receive the action.
   */
  channels?: string[]

  /**
   * All nodes subscribed to channel will receive the action.
   */
  channel?: string

  /**
   * All nodes with listed user IDs will receive the action.
   */
  users?: string[]

  /**
   * All nodes with listed user ID will receive the action.
   */
  user?: string

  /**
   * All nodes with listed client IDs will receive the action.
   */
  clients?: string[]

  /**
   * All nodes with listed client ID will receive the action.
   */
  client?: string

  /**
   * All nodes with listed node IDs will receive the action.
   */
  nodes?: string[]

  /**
   * Node with listed node ID will receive the action.
   */
  node?: string

  /**
   * Client IDs, which will not receive the action.
   */
  excludeClients?: string[]
}

export interface BaseServerOptions {
  /**
   * Server current application subprotocol version in SemVer format.
   */
  subprotocol?: string

  /**
   * npm’s version requirements for client subprotocol version.
   */
  supports?: string

  /**
   * Application root to load files and show errors.
   * Default is `process.cwd()`.
   *
   * ```js
   * root: __dirname
   * ```
   */
  root?: string

  /**
   * URL of main JS file in the root dir. Shortcut to set `root` in ES modules
   * without `fileURLToPath`.
   *
   * ```
   * fileUrl: import.meta.url
   * ```
   */
  fileUrl?: string

  /**
   * Timeout in milliseconds to disconnect connection.
   * Default is `70000`.
   */
  timeout?: number

  /**
   * Milliseconds since last message to test connection by sending ping.
   * Default is `20000`.
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
   * Process ID, to display in logs.
   */
  pid?: number

  /**
   * HTTP server to serve Logux’s WebSocket and HTTP requests.
   *
   * Logux will remove previous HTTP callbacks. Do not use it with Express.js
   * or other HTTP servers with defined routes.
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

  /**
   * Regular expression which should be cleaned from error message and stack.
   *
   * By default it cleans `Bearer [^\s"]+`.
   */
  cleanFromLog?: RegExp

  /**
   * Disable health check endpoint, control HTTP API, {@link Server#http}.
   *
   * The server will process only WebSocket connection and ignore all other
   * HTTP request (so they can be processed by other HTTP server).
   */
  disableHttpServer?: boolean
}

export interface AuthenticatorOptions<Headers extends object> {
  headers: Headers
  client: ServerClient
  userId: string
  cookie: Record<string, string>
  token: string
}

export type SendBackActions =
  | void
  | Action
  | Action[]
  | [Action, Partial<Meta>][]

/**
 * The authentication callback.
 *
 * @param userId User ID.
 * @param token The client credentials.
 * @param client Client object.
 * @returns `true` if credentials was correct
 */
interface Authenticator<Headers extends object> {
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
  ): Resend | Promise<Resend>
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
  ): void | Promise<void>
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
    ctx: Context<{}, Headers>,
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
  ): Promise<ChannelFilter<Headers>> | ChannelFilter<Headers> | void
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
  ): SendBackActions | Promise<SendBackActions>
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
> = (
  | {
      access: Authorizer<TypeAction, Data, Headers>
      process?: Processor<TypeAction, Data, Headers>
    }
  | {
      accessAndProcess: Processor<TypeAction, Data, Headers>
    }
) & {
  resend?: Resender<TypeAction, Data, Headers>
  finally?: ActionFinally<TypeAction, Data, Headers>
}

type ChannelCallbacks<
  SubscribeAction extends Action,
  Data extends object,
  ChannelParams extends object | string[],
  Headers extends object
> = (
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
) & {
  filter?: FilterCreator<SubscribeAction, Data, ChannelParams, Headers>
  finally?: ChannelFinally<SubscribeAction, Data, ChannelParams, Headers>
  unsubscribe?: ChannelUnsubscribe<Data, ChannelParams, Headers>
}

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
  subprotocol: string
  nodeId: string
}

interface ReportersArguments {
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

export interface Reporter {
  <Event extends keyof ReportersArguments>(
    event: Event,
    payload: ReportersArguments[Event]
  ): void
}

export type Resend =
  | string
  | string[]
  | {
      channel?: string
      channels?: string[]
      user?: string
      users?: string[]
      client?: string
      clients?: string[]
      node?: string
      nodes?: string[]
      excludeClients?: string[]
    }

export interface Logger {
  info(details: object, message: string): void
  warn(details: object, message: string): void
  error(details: object, message: string): void
  fatal(details: object, message: string): void
}

interface Response {
  header?: {
    [name: string]: string
  }
  body: string
}

interface GetProcessor {
  safe?: boolean
  request(request: object): Response | Promise<Response>
}

interface PostProcessor {
  isValid(command: object): boolean
  command(command: object, request: object): Promise<void>
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
  Headers extends object = {},
  ServerLog extends Log = Log<ServerMeta>
> {
  /**
   * @param opts Server options.
   */
  constructor(opts: BaseServerOptions)

  /**
   * Server options.
   *
   * ```js
   * console.log('Server options', server.options.subprotocol)
   * ```
   */
  options: BaseServerOptions

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
  log: ServerLog

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
      [nodeId: string]: {
        filters: Record<string, ChannelFilter<{}> | true>
        unsubscribe?: (action: LoguxUnsubscribeAction, meta: ServerMeta) => void
      }
    }
  }

  /**
   * Add callback to internal HTTP server.
   */
  controls: {
    [path: string]: GetProcessor | PostProcessor
  }

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
    fatal: LogFn
    error: LogFn
    warn: LogFn
    info: LogFn
    debug: LogFn
  }

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
  auth(authenticator: Authenticator<Headers>): void

  /**
   * Start WebSocket server and listen for clients.
   *
   * @returns When the server has been bound.
   */
  listen(): Promise<void>

  /**
   * Add non-WebSocket HTTP request processor.
   *
   * ```js
   * server.http((req, res) => {
   *   if (req.url === '/auth') {
   *     let token = signIn(req)
   *     if (token) {
   *       res.setHeader('Set-Cookie', `token=${token}; Secure; HttpOnly`)
   *       res.end()
   *     } else {
   *       res.statusCode = 400
   *       res.end('Wrong user or password')
   *     }
   *   }
   * })
   * ```
   */
  http(listener: (req: IncomingMessage, res: ServerResponse) => void): void

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
    event: 'fatal' | 'clientError',
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
    event: 'connected' | 'disconnected',
    listener: (client: ServerClient) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Client listener.
   */
  on(
    event: 'authenticated',
    listener: (client: ServerClient, latencyMilliseconds: number) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Action listener.
   */
  on(
    event: 'add' | 'clean' | 'backendSent',
    listener: (action: Action, meta: Readonly<ServerMeta>) => void
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
   * @param listener Processing listener.
   */
  on(
    event: 'processed' | 'backendGranted' | 'backendProcessed',
    listener: (
      action: Action,
      meta: Readonly<ServerMeta>,
      latencyMilliseconds: number
    ) => void
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
    event: 'subscribing',
    listener: (action: LoguxSubscribeAction, meta: Readonly<ServerMeta>) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Subscription listener.
   */
  on(
    event: 'unsubscribed',
    listener: (
      action: LoguxUnsubscribeAction,
      meta: Readonly<ServerMeta>
    ) => void
  ): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Event listener.
   */
  on(event: 'subscriptionCancelled', listener: () => void): Unsubscribe

  /**
   * @param event The event name.
   * @param listener Report listener.
   */
  on(event: 'report', listener: Reporter): Unsubscribe

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
   */
  type<TypeAction extends Action = AnyAction, Data extends object = {}>(
    name: TypeAction['type'] | RegExp,
    callbacks: ActionCallbacks<TypeAction, Data, Headers>
  ): void

  /**
   * @param actionCreator Action creator function.
   * @param callbacks Callbacks for action created by creator.
   */
  type<Creator extends AbstractActionCreator, Data extends object = {}>(
    actionCreator: Creator,
    callbacks: ActionCallbacks<ReturnType<Creator>, Data, Headers>
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
  otherType<Data extends object = {}>(
    callbacks: ActionCallbacks<Action, Data, Headers>
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
   */
  channel<
    ChannelParams extends object = {},
    Data extends object = {},
    SubscribeAction extends LoguxSubscribeAction = LoguxSubscribeAction
  >(
    pattern: string,
    callbacks: ChannelCallbacks<SubscribeAction, Data, ChannelParams, Headers>
  ): void

  /**
   * @param pattern Regular expression for channel name.
   * @param callbacks Callback during subscription process.
   */
  channel<
    ChannelParams extends string[] = string[],
    Data extends object = {},
    SubscribeAction extends LoguxSubscribeAction = LoguxSubscribeAction
  >(
    pattern: RegExp,
    callbacks: ChannelCallbacks<SubscribeAction, Data, ChannelParams, Headers>
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
  otherChannel<Data extends object = {}>(
    callbacks: ChannelCallbacks<LoguxSubscribeAction, Data, [string], Headers>
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
  sendAction(action: Action, meta: ServerMeta): void | Promise<void>

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
