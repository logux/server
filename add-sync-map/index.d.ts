import type {
  LoguxSubscribeAction,
  SyncMapChangeAction,
  SyncMapChangedAction,
  SyncMapCreateAction,
  SyncMapCreatedAction,
  SyncMapDeleteAction,
  SyncMapDeletedAction,
  SyncMapTypes,
  SyncMapValues
} from '@logux/actions'

import type { BaseServer, ServerMeta } from '../base-server/index.js'
import type { Context } from '../context/index.js'

declare const WITH_TIME: unique symbol

export type WithTime<Value extends SyncMapTypes | SyncMapTypes[]> = {
  time: number
  value: Value
  [WITH_TIME]: true
}

export type WithoutTime<Value extends SyncMapTypes | SyncMapTypes[]> = {
  time: undefined
  value: Value
  [WITH_TIME]: false
}

export type SyncMapData<Value extends SyncMapValues> = {
  [Key in keyof Value]: WithoutTime<Value[Key]> | WithTime<Value[Key]>
} & { id: string }

/**
 * Add last changed time to value to use in conflict resolution.
 *
 * If you do not know the time, use {@link NoConflictResolution}.
 *
 * @param value The value.
 * @param time UNIX milliseconds.
 * @returns Wrapper.
 */
export function ChangedAt<Value extends SyncMapTypes | SyncMapTypes[]>(
  value: Value,
  time: number
): WithTime<Value>

/**
 * Mark that the value has no last changed date and conflict resolution
 * can’t be applied.
 *
 * @param value The value.
 * @returns Wrapper.
 */
export function NoConflictResolution<
  Value extends SyncMapTypes | SyncMapTypes[]
>(
  value: Value
): WithTime<Value>

interface SyncMapActionFilter<Value extends SyncMapValues> {
  (
    ctx: Context,
    action:
      | SyncMapChangedAction<Value>
      | SyncMapCreatedAction<Value>
      | SyncMapDeletedAction,
    meta: ServerMeta
  ): boolean | Promise<boolean>
}

interface SyncMapOperations<Value extends SyncMapValues> {
  access(
    ctx: Context,
    id: string,
    action:
      | LoguxSubscribeAction
      | SyncMapChangeAction
      | SyncMapCreateAction
      | SyncMapDeleteAction,
    meta: ServerMeta
  ): boolean | Promise<boolean>

  change?(
    ctx: Context,
    id: string,
    fields: Partial<Value>,
    time: number,
    action: SyncMapChangeAction<Value>,
    meta: ServerMeta
  ): boolean | Promise<boolean | void> | void

  create?(
    ctx: Context,
    id: string,
    fields: Value,
    time: number,
    action: SyncMapCreateAction<Value>,
    meta: ServerMeta
  ): boolean | Promise<boolean | void> | void

  delete?(
    ctx: Context,
    id: string,
    action: SyncMapDeleteAction,
    meta: ServerMeta
  ): boolean | Promise<boolean | void> | void

  load?(
    ctx: Context,
    id: string,
    since: number | undefined,
    action: LoguxSubscribeAction,
    meta: ServerMeta
  ): false | Promise<false | SyncMapData<Value>> | SyncMapData<Value>
}

interface SyncMapFilterOperations<Value extends SyncMapValues> {
  access?(
    ctx: Context,
    filter: Partial<Value> | undefined,
    action: LoguxSubscribeAction,
    meta: ServerMeta
  ): boolean | Promise<boolean>

  actions?(
    ctx: Context,
    filter: Partial<Value> | undefined,
    action: LoguxSubscribeAction,
    meta: ServerMeta
  ): Promise<SyncMapActionFilter<Value>> | SyncMapActionFilter<Value> | void

  initial(
    ctx: Context,
    filter: Partial<Value> | undefined,
    since: number | undefined,
    action: LoguxSubscribeAction,
    meta: ServerMeta
  ): Promise<SyncMapData<Value>[]> | SyncMapData<Value>[]
}

/**
 * Add callbacks for client’s `SyncMap`.
 *
 * ```js
 * import { addSyncMap, isFirstTimeOlder, ChangedAt } from '@logux/server'
 * import { LoguxNotFoundError } from '@logux/actions'
 *
 * addSyncMap(server, 'tasks', {
 *   async access (ctx, id) {
 *     const task = await Task.find(id)
 *     return ctx.userId === task.authorId
 *   },
 *
 *   async load (ctx, id, since) {
 *     const task = await Task.find(id)
 *     if (!task) throw new LoguxNotFoundError()
 *     return {
 *       id: task.id,
 *       text: ChangedAt(task.text, task.textChanged),
 *       finished: ChangedAt(task.finished, task.finishedChanged),
 *     }
 *   },
 *
 *   async create (ctx, id, fields, time) {
 *     await Task.create({
 *       id,
 *       text: fields.text,
 *       finished: fields.finished,
 *       authorId: ctx.userId,
 *       textChanged: time,
 *       finishedChanged: time
 *     })
 *   },
 *
 *   async change (ctx, id, fields, time) {
 *     const task = await Task.find(id)
 *     if ('text' in fields) {
 *       if (task.textChanged < time) {
 *         await task.update({
 *           text: fields.text,
 *           textChanged: time
 *         })
 *       }
 *     }
 *     if ('finished' in fields) {
 *       if (task.finishedChanged < time) {
 *         await task.update({
 *           finished: fields.finished,
 *           finishedChanged: time
 *         })
 *       }
 *     }
 *   }
 *
 *   async delete (ctx, id) {
 *     await Task.delete(id)
 *   }
 * })
 * ```
 *
 * @param server Server instance.
 * @param plural Prefix for channel names and action types.
 * @param operations Callbacks.
 */
export function addSyncMap<Values extends SyncMapValues>(
  server: BaseServer,
  plural: string,
  operations: SyncMapOperations<Values>
): void

/**
 * Add callbacks for client’s `useFilter`.
 *
 * ```js
 * import { addSyncMapFilter, ChangedAt } from '@logux/server'
 *
 * addSyncMapFilter(server, 'tasks', {
 *   access (ctx, filter) {
 *     return true
 *   },
 *
 *   initial (ctx, filter, since) {
 *     let tasks = await Tasks.where({ ...filter, authorId: ctx.userId })
 *     // You can return only data changed after `since`
 *     return tasks.map(task => ({
 *       id: task.id,
 *       text: ChangedAt(task.text, task.textChanged),
 *       finished: ChangedAt(task.finished, task.finishedChanged),
 *     }))
 *   },
 *
 *   actions (filterCtx, filter) {
 *     return (actionCtx, action, meta) => {
 *       return actionCtx.userId === filterCtx.userId
 *     }
 *   }
 * })
 * ```

 * @param server Server instance.
 * @param plural Prefix for channel names and action types.
 * @param operations Callbacks.
 */
export function addSyncMapFilter<Values extends SyncMapValues>(
  server: BaseServer,
  plural: string,
  operations: SyncMapFilterOperations<Values>
): void
