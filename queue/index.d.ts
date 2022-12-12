import { Action, Meta } from '@logux/core'

export class Queue {
  /**
   * @param app The server.
   */

  constructor(app: BaseServer)

  /**
   * Server, which processes actions
   */
  app: BaseServer

  /**
   * Types of actions to be processed in queue
   */
  actionTypes: string[]

  /**
   * Key, that links client and queue
   */
  key: number

  /**
   * Enqueued actions and metadata
   */
  data: (Action | Meta)[]

  /**
   * Current status of the queue
   */
  processing: boolean
}
