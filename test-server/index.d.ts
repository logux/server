import { TestTime } from '@logux/core'

import TestClient, { TestClientOptions } from '../test-client'
import BaseServer from '../base-server'

type TestServerOptions = {
  /**
   * Print server log to the console for debug.
   */
  reporter?: 'human'
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
export default class TestServer extends BaseServer {
  /**
   * @param opts The limit subset of server options.
   */
  constructor (opts: TestServerOptions)

  /**
   * Time replacement without variable parts like current timestamp.
   */
  time: TestTime

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
