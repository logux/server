import { TestTime, TestLog } from '@logux/core'

import TestClient, { TestClientOptions } from '../test-client'
import BaseServer, {
  ServerMeta,
  BaseServerOptions,
  Reporter
} from '../base-server'
import { ReporterOptions } from '../server'

export type TestServerOptions = Omit<
  BaseServerOptions,
  'subprotocol' | 'supports'
> & {
  subprotocol?: string
  supports?: string

  /**
   * Disable built-in auth.
   */
  auth?: false

  /**
   * Low-level API to server logs for tests.
   * TODO [sl.aleksandr 06.05.2020] Update docs
   */
  reporter?: Reporter | ReporterOptions
}

/**
 * Server to be used in test.
 *
 * ```js
 * import { TestServer } from '@logux/server'
 * import usersModule from '.'
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
export default class TestServer<H extends object = {}> extends BaseServer<H> {
  /**
   * @param opts The limit subset of server options.
   */
  constructor (opts?: TestServerOptions)

  /**
   * Time replacement without variable parts like current timestamp.
   */
  time: TestTime

  /**
   * Server actions log, with methods to check actions inside.
   *
   * ```js
   * server.log.actions() //=> […]
   * ```
   */
  log: TestLog<ServerMeta>

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
   */
  connect (userId: string, opts?: TestClientOptions): Promise<TestClient>
}
