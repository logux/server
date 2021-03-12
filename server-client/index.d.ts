import { ServerConnection, ServerNode } from '@logux/core'

import { BaseServer } from '../base-server/index.js'

/**
 * Logux client connected to server.
 *
 * ```js
 * const client = server.connected.get(0)
 * ```
 */
export class ServerClient {
  /**
   * @param app The server.
   * @param connection The Logux connection.
   * @param key Client number used as `app.connected` key.
   */
  constructor(app: BaseServer, connection: ServerConnection, key: number)

  /**
   * Server, which received client.
   */
  app: BaseServer

  /**
   * User ID. It will be filled from client’s node ID.
   * It will be undefined before correct authentication.
   */
  userId?: string

  /**
   * Unique persistence machine ID.
   * It will be undefined before correct authentication.
   */
  clientId?: string

  /**
   * Unique node ID.
   * It will be undefined before correct authentication.
   */
  nodeId?: string

  /**
   * Does server process some action from client.
   *
   * ```js
   * console.log('Clients in processing:', clients.map(i => i.processing))
   * ```
   */
  processing: boolean

  /**
   * The Logux wrapper to WebSocket connection.
   *
   * ```js
   * console.log(client.connection.ws.upgradeReq.headers)
   * ```
   */
  connection: ServerConnection

  /**
   * Client number used as `app.connected` key.
   *
   * ```js
   * function stillConnected (client) {
   *   return app.connected.has(client.key)
   * }
   * ```
   */
  key: string

  /**
   * Client IP address.
   *
   * ```js
   * const clientCity = detectLocation(client.remoteAddress)
   * ```
   */
  remoteAddress: string

  /**
   * HTTP headers of WS connection.
   *
   * ```js
   * client.httpHeaders['User-Agent']
   * ```
   */
  httpHeaders: { [name: string]: string }

  /**
   * Node instance to synchronize logs.
   *
   * ```js
   * if (client.node.state === 'synchronized')
   * ```
   */
  node: ServerNode

  /**
   * Check client subprotocol version. It uses `semver` npm package
   * to parse requirements.
   *
   * ```js
   * if (client.isSubprotocol('4.x')) {
   *   useOldAPI()
   * }
   * ```
   *
   * @param range npm’s version requirements.
   * @returns Is version satisfies requirements.
   */
  isSubprotocol(range: string): boolean

  /**
   * Disconnect client.
   */
  destroy(): void
}
