import { Action, Meta, TestLog, TestPair } from '@logux/core'

import { LoguxSubscribeAction, LoguxUnsubscribeAction } from '../base-server'
import TestServer from '../test-server'

export type TestClientOptions = {
  subprotocol?: string,
  token?: string
}

/**
 * Client to test server.
 *
 * ```js
 * import { TestServer } from '@logux/server'
 * import postsModule from '.'
 * import authModule from '.'
 *
 * let destroyable
 * afterEach(() => {
 *   if (destroyable) destroyable.destroy()
 * })
 *
 * function createServer () {
 *   destroyable = new TestServer()
 *   return destroyable
 * }
 *
 * it('check auth', () => {
 *   let server = createServer()
 *   authModule(server)
 *   await server.connect('1', { token: 'good' })
 *    expect(() => {
 *      await server.connect('2', { token: 'bad' })
 *    }).rejects.toEqual({
 *      error: 'Wrong credentials'
 *    })
 * })
 *
 * it('creates and loads posts', () => {
 *   let server = createServer()
 *   postsModule(server)
 *   let client1 = await server.connect('1')
 *   await client1.process({ type: 'posts/add', post })
 *   let client1 = await server.connect('2')
 *   expect(await client2.subscribe('posts')).toEqual([
 *     { type: 'posts/add', post }
 *   ])
 * })
 * ```
 */
export default class TestClient {
  /**
   * @param server Test server.
   * @param userId User ID.
   * @param opts Other options.
   */
  constructor (server: TestServer, userId: string, opts?: TestClientOptions)

  /**
   * Client’s log with extra methods to check actions inside.
   *
   * ```js
   * console.log(client.log.entries())
   * ```
   */
  log: TestLog

  /**
   * Client’s node ID.
   *
   * ```js
   * let client = new TestClient(server, '10')
   * client.nodeId //=> '10:1:test'
   * ```
   */
  nodeId: string

  /**
   * Connection channel between client and server to track sent messages.
   *
   * ```js
   * console.log(client.pair.leftSent)
   * ```
   */
  pair: TestPair

  /**
   * Connect to test server.
   *
   * ```js
   * let client = new TestClient(server, '10')
   * await client.connect()
   * ```
   *
   * @params Connection credentials.
   * @returns Promise until the authorization.
   */
  connect (opts?: { token: string }): Promise<void>

  /**
   * Disconnect from test server.
   *
   * ```js
   * await client.disconnect()
   * ```
   *
   * @returns Promise until connection close.
   */
  disconnect (): Promise<void>

  /**
   * Actions added server and other clients during the `test` call.
   *
   * ```js
   * let answers = await client.collect(async () => {
   *   client.log.add({ type: 'pay' })
   *   await delay(10)
   * })
   * expect(actions).toEqual([{ type: 'paid' }])
   * ```
   *
   * @param test Function, where do you expect action will be received
   * @returns Promise will all received actions
   */
  collect (test: () => Promise<void>): Promise<Action[]>

  /**
   * Send action to the sever and collect all response actions.
   *
   * ```js
   * await client.process({ type: 'posts/add', post })
   * let posts = await client.subscribe('posts')
   * expect(posts).toHaveLength(1)
   * ```
   *
   * @param action New action.
   * @param meta Optional action’s meta.
   * @returns Promise until `logux/processed` answer.
   */
  process (action: Action, meta?: Meta): Promise<Action[]>

  /**
   * Subscribe to the channel and collect all actions dunring the subscription.
   *
   * ```js
   * let posts = await client.subscribe('posts')
   * expect(posts).toEqual([
   *   { type: 'posts/add', post }
   * ])
   * ```
   *
   * @param channel Channel name or `logux/subscribe` action.
   * @returns Promise with all actions from the server.
   */
  subscribe (channel: string | LoguxSubscribeAction): Promise<Action[]>

  /**
   * Unsubscribe client from the channel.
   *
   * ```js
   * await client.unsubscribe('posts')
   * ```
   *
   * @param channel Channel name or `logux/subscribe` action.
   * @returns Promise until server will remove client from subscribers.
   */
  unsubscribe (channel: string | LoguxUnsubscribeAction): Promise<Action[]>
}
