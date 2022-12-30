import { Action, Meta } from '@logux/core'

/**
 * Queue channel.
 * Controls action processing in queues.
 * One queue can have serveral channels,
 * the default channel is 'main'.
 */

type queueChannel = {
  processing: boolean
  data: (Action | Meta)[]
}

export class Queue {
  /**
   * @param app The server.
   * @param queueChannels processes different actions.
   * @param key Links queue and client.
   */
  constructor(
    app: BaseServer,
    queueChannels: Map<string, queueChannel>,
    key: number
  )

  /**
   * Server, which processes actions.
   */
  app: BaseServer

  /**
   * Channels for processing different actions in parallel.
   */
  queueChannels: Map<string, queueChannel>

  /**
   * Key for BaseServer's queues Map.
   * Queue's key corresponds to client.
   */
  key: string
}
