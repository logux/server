import type { Task } from '../processing/index.js'

export interface ProcessingOutcome {
  extra?: object
  reason?: string
  replayed?: boolean
  type: 'cancelled' | 'processed' | 'undo'
}

export interface ProcessingEntry {
  /**
   * Connection key of the client, which owns the subscription outcome.
   */
  connection?: string

  outcome?: ProcessingOutcome

  /**
   * The task, which is still running.
   */
  task?: Task
}

/**
 * The running tasks and the recent outcomes of the actions by duplicate key.
 *
 * The server answers a re-sent action from this store instead of running
 * its callbacks again. Logux Server Pro replaces it with a Redis-based
 * store to share the outcomes between the servers.
 */
export class ProcessingStore {
  entries: Map<string, ProcessingEntry>

  limit: number

  constructor(limit?: number)

  delete(key: string): void

  finish(
    key: string,
    outcome: ProcessingOutcome,
    connection: string | undefined
  ): void

  get(key: string): ProcessingEntry | undefined

  removeConnection(connection: string): void

  start(key: string, task: Task): void
}
