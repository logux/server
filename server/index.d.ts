import {
  BaseServer,
  type BaseServerOptions,
  type Logger
} from '../base-server/index.js'

export interface LogStream {
  /**
   * Used to synchronously write log messages on application failure.
   */
  flushSync?(): void

  write(str: string): void
}

export interface LoggerOptions {
  /**
   * Use color for human output.
   */
  color?: boolean

  /**
   * Stream to be used by logger to write log.
   */
  stream?: LogStream

  /**
   * Logger message format.
   */
  type?: 'human' | 'json'
}

export interface ServerOptions extends BaseServerOptions {
  /**
   * Logger with custom settings.
   *
   * You can either configure built-in logger or provide your own.
   */
  logger?: Logger | LoggerOptions
}

/**
 * End-user API to create Logux server.
 *
 * ```js
 * import { Server } from '@logux/server'
 *
 * const env = process.env.NODE_ENV || 'development'
 * const envOptions = {}
 * if (env === 'production') {
 *   envOptions.cert = 'cert.pem'
 *   envOptions.key = 'key.pem'
 * }
 *
 * const server = new Server(Object.assign({
 *   subprotocol: 1,
 *   minSubprotocol: 1,
 *   root: import.meta.dirname
 * }, envOptions))
 *
 * server.listen()
 * ```
 */
export class Server<
  Headers extends object = unknown
> extends BaseServer<Headers> {
  /**
   * Server options.
   *
   * ```js
   * console.log('Server options', server.options.subprotocol)
   * ```
   */
  options: ServerOptions

  /**
   * @param opts Server options.
   */
  constructor(opts: ServerOptions)

  /**
   * Load options from command-line arguments and/or environment.
   *
   * ```js
   * const server = new Server(Server.loadOptions(process, {
   *   minSubprotocol: 1,
   *   subprotocol: 1,
   *   root: import.meta.dirname,
   *   port: 31337
   * }))
   * ```
   *
   * @param process Current process object.
   * @param defaults Default server options. Arguments and environment
   *                 variables will override them.
   * @returns Parsed options object.
   */
  static loadOptions(
    process: NodeJS.Process,
    defaults: ServerOptions
  ): ServerOptions

  /**
   * Load module creators and apply to the server. By default, it will load
   * files from `modules/*`.
   *
   * ```js
   * await server.autoloadModules()
   * ```
   *
   * @param files Pattern for module files.
   */
  autoloadModules(files?: string | string[]): Promise<void>
}
