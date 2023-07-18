import type { ServerConnection, ServerNode } from '@logux/core'

import type { BaseServer } from '../base-server/index.js'

/**
 * Logux client connected to server.
 *
 * ```js
 * const client = server.connected.get(0)
 * ```
 */
export class ServerClient {
  /**
   * Server, which received client.
   */
  app: BaseServer

  /**
   * Unique persistence machine ID.
   * It will be undefined before correct authentication.
   */
  clientId?: string

  /**
   * The Logux wrapper to WebSocket connection.
   *
   * ```js
   * console.log(client.connection.ws.upgradeReq.headers)
   * ```
   */
  connection: ServerConnection

  /**
   * HTTP headers of WS connection.
   *
   * ```js
   * client.httpHeaders['User-Agent']
   * ```
   */
  httpHeaders: { [name: string]: string }

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
   * Node instance to synchronize logs.
   *
   * ```js
   * if (client.node.state === 'synchronized')
   * ```
   */
  node: ServerNode

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
   * Client IP address.
   *
   * ```js
   * const clientCity = detectLocation(client.remoteAddress)
   * ```
   */
  remoteAddress: string

  /**
   * User ID. It will be filled from client’s node ID.
   * It will be undefined before correct authentication.
   */
  userId?: string

  /**
   * @param app The server.
   * @param connection The Logux connection.
   * @param key Client number used as `app.connected` key.
   */
  constructor(app: BaseServer, connection: ServerConnection, key: number)

  /**
   * Disconnect client.
   */
  destroy(): void

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
}
