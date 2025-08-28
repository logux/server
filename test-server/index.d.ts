import type { TestLog, TestTime } from '@logux/core'

import { BaseServer } from '../base-server/index.js'
import type {
  BaseServerOptions,
  Logger,
  ServerMeta
} from '../base-server/index.js'
import type { LoggerOptions } from '../server/index.js'
import type { TestClient, TestClientOptions } from '../test-client/index.js'

export interface TestServerOptions
  extends Omit<BaseServerOptions, 'minSubprotocol' | 'subprotocol'> {
  /**
   * Disable built-in auth.
   */
  auth?: false

  /**
   * Logger with custom settings.
   */
  logger?: Logger | LoggerOptions

  minSubprotocol?: number

  subprotocol?: number
}

/**
 * Server to be used in test.
 *
 * ```js
 * import { TestServer } from '@logux/server'
 * import usersModule from './users.js'
 *
 * let server
 * afterEach(() => {
 *   if (server) server.destroy()
 * })
 *
 * it('connects to the server', () => {
 *   server = new TestServer()
 *   usersModule(server)
 *   let client = await server.connect('10')
 * })
 * ```
 */
export class TestServer<
  Headers extends object = unknown
> extends BaseServer<Headers> {
  /**
   * fetch() compatible API to test HTTP endpoints.
   *
   * ```js
   * server.http('GET', '/version', (req, res) => {
   *   res.end('1.0.0')
   * })
   * let res = await server.fetch()
   * expect(await res.text()).toEqual('1.0.0')
   * ```
   */
  fetch: typeof fetch

  /**
   * Server actions log, with methods to check actions inside.
   *
   * ```js
   * server.log.actions() //=> […]
   * ```
   */
  log: TestLog<ServerMeta>

  /**
   * Time replacement without variable parts like current timestamp.
   */
  time: TestTime

  /**
   * @param opts The limit subset of server options.
   */
  constructor(opts?: TestServerOptions)

  /**
   * Create and connect client.
   *
   * ```js
   * server = new TestServer()
   * let client = await server.connect('10')
   * ```
   *
   * @param userId User ID.
   * @param opts Other options.
   * @returns Promise with new client.
   */
  connect(userId: string, opts?: TestClientOptions): Promise<TestClient>

  /**
   * Call callback and throw an error if there was no `Action was denied`
   * during callback.
   *
   * ```js
   * await server.expectDenied(async () => {
   *   client.subscribe('secrets')
   * })
   * ```
   *
   * @param test Callback with subscripting or action sending.
   */
  expectDenied(test: () => unknown): Promise<void>

  /**
   * Call callback and throw an error if there was no error during
   * server processing.
   *
   * @param text RegExp or string of error message.
   * @param test Callback with subscripting or action sending.
   */
  expectError(text: RegExp | string, test: () => unknown): Promise<void>

  /**
   * Call callback and throw an error if there was no `logux/undo` in return
   * with specific reason.
   *
   * ```js
   * await server.expectUndo('notFound', async () => {
   *   client.subscribe('projects/nothing')
   * })
   * ```
   *
   * @param reason The reason in undo action.
   * @param test Callback with subscripting or action sending.
   */
  expectUndo(reason: string, test: () => unknown): Promise<void>

  /**
   * Try to connect client and throw an error is client didn’t received
   * `Wrong Cregentials` message from the server.
   *
   * ```js
   * server = new TestServer()
   * await server.expectWrongCredentials('10')
   * ```
   *
   * @param userId User ID.
   * @param opts Other options.
   * @returns Promise until check.
   */
  expectWrongCredentials(
    userId: string,
    opts?: TestClientOptions
  ): Promise<void>
}
