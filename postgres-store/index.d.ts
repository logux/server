import type { ActionPacker } from '@logux/actions'
import type {
  Action,
  AnyAction,
  Criteria,
  LogPage,
  LogStore,
  Meta
} from '@logux/core'

/**
 * Logux declares these two, but does not export them, so they are taken
 * from the methods not to repeat the definition here.
 */
type GetOptions = NonNullable<Parameters<LogStore['get']>[0]>
type LastSynced = Awaited<ReturnType<LogStore['getLastSynced']>>

/**
 * Rows of the query. `pg` and PGlite keep them in the result object,
 * `postgres` returns them as an array.
 */
export type PostgresRows =
  | { rows: Record<string, unknown>[] }
  | Record<string, unknown>[]

/**
 * Minimal database interface for the drivers, which the store does not
 * support out of the box.
 *
 * ```js
 * let query = (sql, params) => driver.run(sql, params)
 * query.transaction = body => {
 *   return driver.tx(tx => body((sql, params) => tx.run(sql, params)))
 * }
 *
 * let store = new PostgresStore(query)
 * ```
 */
export interface PostgresQuery {
  (sql: string, params: unknown[]): Promise<PostgresRows>

  /**
   * Run the callback on a single connection inside a transaction.
   *
   * Without it `init()` can not lock the migrations, so two servers
   * starting at the same moment can apply them twice.
   */
  transaction?: (body: (query: PostgresQuery) => Promise<void>) => Promise<void>
}

/**
 * Database driver, which the store can use without any wrapper:
 * `pg`’s `Pool` or `Client`, PGlite, or `postgres`.
 *
 * The parameters are `never[]`, so that the driver’s own stricter types
 * for them still match this type.
 */
export type PostgresDriver =
  | {
      begin?(body: (tx: PostgresDriver) => Promise<unknown>): Promise<unknown>
      unsafe(sql: string, params: never[]): Promise<unknown>
    }
  | {
      connect?(): Promise<unknown>
      query(sql: string, params: never[]): Promise<unknown>
      transaction?(
        body: (tx: PostgresDriver) => Promise<unknown>
      ): Promise<unknown>
    }

export interface PostgresStoreOptions {
  /**
   * How many entries to load by a single query in `get()`.
   */
  pageSize?: number

  /**
   * Packers by the action type to keep the binary parts of the action
   * in the `blob` column instead of Base64 inside JSON.
   *
   * `zeroPacker` is always added, so this is only for custom actions.
   */
  packers?: Record<string, ActionPacker<Action, Action>>
}

/**
 * Log store, which keeps actions in PostgreSQL.
 *
 * It takes the database of `pg`, `postgres`, or PGlite. For any other driver,
 * pass the function to send the query, see {@link PostgresQuery}.
 *
 * ```js
 * import { PostgresStore, Server } from '@logux/server'
 * import { Pool } from 'pg'
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL })
 * const store = new PostgresStore(pool)
 * await store.init()
 *
 * const server = new Server(Server.loadOptions(process, {
 *   minSubprotocol: 1,
 *   subprotocol: 1,
 *   root: import.meta.dirname,
 *   store
 * }))
 * ```
 */
export class PostgresStore implements LogStore {
  constructor(db: PostgresDriver | PostgresQuery, opts?: PostgresStoreOptions)

  add(action: AnyAction, meta: Meta): Promise<false | Meta>

  addReason(reasons: string[], criteria: Criteria): Promise<void>

  byId(id: string): Promise<[Action, Meta] | [null, null]>

  changeMeta(id: string, diff: Partial<Meta>): Promise<boolean>

  clean(): Promise<void>

  get(opts?: GetOptions): Promise<LogPage>

  getLastAdded(): Promise<number>

  getLastSynced(): Promise<LastSynced>

  /**
   * Bring the log tables to the latest version, creating them if they were
   * not created by the application’s migration.
   */
  init(): Promise<void>

  remove(id: string): Promise<[Action, Meta] | false>

  removeReason(
    reasons: string[],
    criteria: Criteria,
    callback: (action: Action, meta: Meta) => void
  ): Promise<void>

  setLastSynced(values: Partial<LastSynced>): Promise<void>
}
