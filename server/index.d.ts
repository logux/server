import BaseServer, { Logger, Reporter, BaseServerOptions } from '../base-server'

export type ServerOptions = BaseServerOptions & {
  /**
   * Report process/errors to CLI in pino, JSON or in human readable
   * format. It can be also a function to show current server status.
   * Default is `'human'`.
   */
  reporter?: 'human' | 'json' | Reporter

  /**
   * Logger with custom settings.
   */
  logger?: Logger
}

/**
 * End-user API to create Logux server.
 *
 * ```js
 * const { Server } = require('@logux/server')
 *
 * const env = process.env.NODE_ENV || 'development'
 * const envOptions = {}
 * if (env === 'production') {
 *   envOptions.cert = 'cert.pem'
 *   envOptions.key = 'key.pem'
 * }
 *
 * const server = new Server(Object.assign({
 *   subprotocol: '1.0.0',
 *   supports: '1.x || 0.x',
 *   root: __dirname
 * }, envOptions))
 *
 * server.listen()
 * ```
 */
export default class Server extends BaseServer {
  /**
   * Load options from command-line arguments and/or environment
   *
   * ```js
   * const server = new Server(Server.loadOptions(process, {
   *   subprotocol: '1.0.0',
   *   supports: '1.x',
   *   root: __dirname,
   *   port: 31337
   * }))
   * ```
   *
   * @param process Current process object.
   * @param defaults Default server options. Arguments and environment
   *                 variables will override them.
   * @returns Parsed options object.
   */
  static loadOptions (
    process: NodeJS.Process,
    defaults: ServerOptions
  ): ServerOptions

  /**
   * @param opts Server options.
   */
  constructor (opts: ServerOptions)

  /**
   * Server options.
   *
   * ```js
   * console.log('Server options', server.options.subprotocol)
   * ```
   */
  options: ServerOptions
}
