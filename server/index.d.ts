import BaseServer, {
  Logger,
  Reporter,
  BaseServerOptions
} from '../base-server/index.js'

export type ServerOptions = BaseServerOptions & {
  /**
   * Custom reporter for process/errors. You should use it only for test purposes
   * or unavoidable hacks.
   *
   * ```js
   * new Server({
   *   …,
   *   reporter: (name, details) => {
   *     console.log('Event:', name)
   *     console.log('Details:', JSON.stringify(details))
   *   }
   * })
   * ```
   */
  reporter?: Reporter

  /**
   * Stream to be used by reporter to write log.
   */
  reporterStream?: {
    write(str: string): void
  }

  /**
   * Logger with custom settings.
   *
   * Custom logger example: pino logger that streams logs to
   * elasticsearch
   *
   * ```js
   * const pino = require('pino')
   * const pinoElastic = require('pino-elasticsearch')
   *
   * const streamToElastic = pinoElastic({
   *   consistency: 'one',
   *   node: 'http://localhost:9200',
   *   ecs: true
   * })
   *
   * const server = new Server(
   *   Server.loadOptions(process, {
   *     …,
   *     logger: pino({ level: 'info' }, streamToElastic)
   *   })
   * )
   * ```
   *
   * Other logger examples can be found here http://getpino.io/#/docs/ecosystem
   */
  logger?: 'human' | 'json' | Logger
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
export default class Server<H extends object = {}> extends BaseServer<H> {
  /**
   * Load options from command-line arguments and/or environment.
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
