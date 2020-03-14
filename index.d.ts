import { Server as HTTPServer } from "http";
import Logger from "bunyan";

type TestTime = any; // TODO: import types from @logux/core
type MemoryStore = any; // TODO: import types from @logux/core
type ServerConnection = any; // TODO: import types from @logux/core

/**
 * BaseServer options.
 */
export declare type LoguxServerBaseOptions = {
  /**
   * Server current application subprotocol version in SemVer format.
   */
  subprotocol: string;

  /**
   * npm’s version requirements for client subprotocol version.
   */
  supports: string;

  /**
   * Application root to load files and show errors.
   *
   * @default process.cwd()
   */
  root?: string;

  /**
   * Timeout in milliseconds to disconnect connection.
   *
   * @default 20000
   */
  timeout?: number;

  /**
   * Milliseconds since last message to test connection by sending ping.
   *
   * @default 10000
   */
  ping?: number;

  /**
   * URL to PHP, Ruby on Rails, or other backend to process actions and
   * authentication.
   */
  backend?: string;

  /**
   * URL to Redis for Logux Server Pro scaling.
   */
  redis?: string;

  /**
   * Host to bind HTTP server to control Logux server.
   *
   * @default '127.0.0.1'
   */
  controlHost?: string;

  /**
   * Port to control the server.
   *
   * @default 31338
   */
  controlPort?: number;

  /**
   * Password to control the server.
   */
  controlPassword?: string;

  /**
   * Store to save log.
   *
   * @default MemoryStore
   */
  store?: MemoryStore;

  /**
   * Test time to test server.
   */
  time?: TestTime;

  /**
   * Custom random ID to be used in node ID.
   */
  id?: string;

  /**
   * Development or production server mode.
   *
   * @default process.env.NODE_ENV || 'development'
   */
  env?: string;

  /**
   * Process ID, to display in reporter.
   */
  pid?: number;

  /**
   * HTTP server to connect WebSocket server to it. Same as in `ws.Server`.
   */
  server?: HTTPServer;

  /**
   * Port to bind server. It will create HTTP server manually to connect
   * WebSocket server to it.
   *
   * @default 31337
   */
  port?: number;

  /**
   * IP-address to bind server.
   *
   * @default '127.0.0.1'
   */
  host?: string;

  /**
   * SSL key or path to it. Path could be relative from server root.
   * It is required in production mode, because WSS is highly recommended.
   */
  key?: string;

  /**
   * SSL certificate or path to it. Path could be relative from server
   * root. It is required in production mode, because WSS is highly
   * recommended.
   */
  cert?: string;

  /**
   * Function to show current server status.
   */
  reporter?: (event: string, payload: Object) => void;
};

/**
 * Server options.
 */
export declare type LoguxServerOptions = LoguxServerBaseOptions & {
  /**
   * Report process/errors to CLI in bunyan JSON or in human readable
   * format. It can be also a function to show current server status.
   *
   * @default 'human'
   */
  reporter?: "human" | "json" | LoguxServerBaseOptions["reporter"];

  /**
   * Bunyan logger with custom settings.
   */
  bunyan?: Logger;
};

/**
 * The authentication callback.
 */
export declare type LoguxServerAuthenticator = (
  /**
   * User ID.
   */
  userId: number | string | false,

  /**
   * The client credentials.
   */
  credentials: any | undefined,

  /**
   * Client object.
   */
  server: HTTPServer
) => boolean | Promise<boolean>;

/**
 * Check does user can do this action.
 */
export declare type LoguxServerAuthorizer = (
  ctx: Context,
  action: Action,
  meta: Meta
) => boolean | Promise<boolean>;

/**
 * Return object with keys for meta to resend action to other users.
 */
export declare type LoguxServerResender = (
  ctx: Context,
  action: Action,
  meta: Meta
) => Object | Promise<Object>;

/**
 * Action business logic.
 */
export declare type LoguxServerProcessor = (
  ctx: Context,
  action: Action,
  meta: Meta
) => void | Promise<void>;

/**
 * Callback which will be run on the end of action/subscription
 * processing or on an error.
 */
export declare type LoguxServerFinally = (
  ctx: Context,
  action: Action,
  meta: Meta
) => void;

/**
 * Generates custom filter for channel’s actions.
 */
export declare type LoguxServerFilterCreator = (
  ctx: Context,
  action: Action,
  meta: Meta
) => (ctx: Context, action: Action, meta: Meta) => boolean;

/**
 * Creates actions with initial state.
 */
export declare type LoguxServerInitialized = (
  ctx: Context,
  action: Action,
  meta: Meta
) => void | Promise<void>;

/**
 * Action type’s callbacks.
 */
export declare type LoguxServerTypeCallbacks = {
  access: LoguxServerAuthorizer;
  resend?: LoguxServerResender;
  process?: LoguxServerProcessor;
  finally?: LoguxServerFinally;
};

/**
 * Channel callbacks.
 */
export declare type LoguxServerChannelCallbacks = {
  access: LoguxServerAuthorizer;
  filter?: LoguxServerFilterCreator;
  init?: LoguxServerInitialized;
  finally?: LoguxServerFinally;
};

/**
 * Logux action type
 */
type LoguxServerAction = {
  type: string;
  id?: string;
  channel?: string;
  since?: {
    id: string;
    time: number;
  };
};

/**
 * Logux meta type
 */
type LoguxServerMeta = {
  id: string;
  time: number;
  subprotocol: LoguxServerBaseOptions["subprotocol"];
  reasons: string[];
  server: string;
  clients?: string[];
  status?: "add" | "clean" | "processed" | "subscribed";
};

/**
 * List of meta keys permitted for clients.
 */
export declare const ALLOWED_META: string[];

/**
 * Basic Logux Server API without good UI. Use it only if you need
 * to create some special hacks on top of Logux Server.
 *
 * In most use cases you should use Server.
 */
export declare class BaseServer {
  constructor(opts: LoguxServerBaseOptions);

  /**
   * Set authenticate function. It will receive client credentials
   * and node ID. It should return a Promise with `true` or `false`.
   */
  public auth: (
    authenticator: LoguxServerAuthenticator
  ) => ReturnType<LoguxServerAuthenticator>;

  /**
   * Start WebSocket server and listen for clients.
   */
  public listen: () => Promise<void>;

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
   */
  public on: (
    event: "fatal" | "clientError",
    listener: (err: Error) => void
  ) => void;
  public on: (
    event: "error",
    listener: (
      err: Error,
      action: LoguxServerAction,
      meta: LoguxServerMeta
    ) => void
  ) => void;
  public on: (
    event: "connected" | "disconnected",
    listener: (server: HTTPServer) => void
  ) => void;
  public on: (
    event: "preadd" | "add" | "clean",
    listener: (action: LoguxServerAction, meta: LoguxServerMeta) => void
  ) => void;
  public on: (
    event: "processed" | "subscribed",
    listener: (
      action: LoguxServerAction,
      meta: LoguxServerMeta,
      latencyMilliseconds: number
    ) => void
  ) => void;

  /**
   * Stop server and unbind all listeners.
   */
  public destroy: () => Promise<void>;

  /**
   * Define action type’s callbacks.
   */
  public type: (name: string, callbacks: LoguxServerTypeCallbacks) => void;

  /**
   * Define callbacks for actions, which type was not defined
   * by any Server.type
   * Useful for proxy or some hacks.
   *
   * Without this settings, server will call Server.unknownType
   * on unknown type.
   */
  public otherType: (callbacks: LoguxServerTypeCallbacks) => void;

  /**
   * Define the channel.
   */
  public channel: (
    pattern: string | RegExp,
    callbacks: LoguxServerChannelCallbacks
  ) => void;

  /**
   * Set callbacks for unknown channel subscription.
   */
  public otherChannel: (callbacks: LoguxServerChannelCallbacks) => void;

  /**
   * Undo action from client.
   */
  public undo: (
    meta: Meta,

    /**
     * Optional code for reason.
     *
     * @default 'error'
     */
    reason: string,

    /**
     * Extra fields to `logux/undo` action.
     */
    extra: Object
  ) => Promise<void>;

  /**
   * Send runtime error stacktrace to all clients.
   */
  public debugError: (error: Error) => void;

  /**
   * Send action, received by other server, to all clients of current server.
   * This method is for multi-server configuration only.
   */
  public sendAction: (action: Action, meta: Meta) => void;

  /**
   * Add new client for server. You should call this method manually
   * mostly for test purposes. Returned client ID.
   */
  public addClient: (connection: ServerConnection) => number;

  /**
   * If you receive action with unknown type, this method will mark this action
   * with `error` status and undo it on the clients.
   *
   * If you didn’t set Server.otherType.
   * Logux will call it automatically.
   */
  public unknownType: (action: Action, meta: Meta) => void;

  /**
   * Report that client try to subscribe for unknown channel.
   *
   * Logux call it automatically,
   * if you will not set Server.otherChannel
   */
  public wrongChannel: (action: Action, meta: Meta) => void;
}

/**
 * End-user API to create Logux server.
 */
export declare class Server extends BaseServer {
  /**
   * Load options from command-line arguments and/or environment
   */
  static loadOptions: (
    process: NodeJS.Process,
    defaults: LoguxServerOptions
  ) => LoguxServerBaseOptions;
}

/**
 * Information about node, who create this action.
 */
declare class Context<PatternParams extends Object | Array = {}> {
  constructor(
    /**
     * Unique node ID.
     */
    nodeId: string,

    /**
     * Unique persistence client ID.
     */
    clientId: string,

    /**
     * User ID taken node ID.
     */
    userId: string | undefined,

    subprotocol: LoguxServerBaseOptions["subprotocol"],
    server: HTTPServer
  );

  /**
   * Check creator subprotocol version. It uses `semver` npm package
   * to parse requirements.
   */
  public isSubprotocol: (range: string) => boolean;

  /**
   * Send action back to the client.
   */
  public sendBack: (action: Action, meta: Meta) => Promise<void>;

  /**
   * Parsed variable parts of channel pattern.
   */
  public params?: PatternParams;
}
