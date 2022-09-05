import {
  LoguxSubscribeAction,
  SyncMapChangeAction,
  SyncMapCreateAction,
  SyncMapDeleteAction,
  SyncMapValues,
  SyncMapTypes
} from '@logux/actions'

import { BaseServer, ServerMeta } from '../base-server/index.js'
import { Context } from '../context/index.js'

declare const WITH_TIME: unique symbol

export type WithTime<Value extends SyncMapTypes | SyncMapTypes[]> = {
  value: Value
  time: number
  [WITH_TIME]: true
}

export type WithoutTime<Value extends SyncMapTypes | SyncMapTypes[]> = {
  value: Value
  time: undefined
  [WITH_TIME]: false
}

export type SyncMapData<Value extends SyncMapValues> = { id: string } & {
  [Key in keyof Value]: WithTime<Value[Key]> | WithoutTime<Value[Key]>
}

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
    action: SyncMapCreateAction<Value> | SyncMapDeleteAction,
    meta: ServerMeta
  ): Promise<boolean> | boolean
}

interface SyncMapOperations<Value extends SyncMapValues> {
  access(
    ctx: Context,
    id: string,
    action:
      | SyncMapCreateAction
      | SyncMapChangeAction
      | SyncMapDeleteAction
      | LoguxSubscribeAction,
    meta: ServerMeta
  ): Promise<boolean> | boolean

  load?(
    ctx: Context,
    id: string,
    since: number | undefined,
    action: LoguxSubscribeAction,
    meta: ServerMeta
  ): Promise<SyncMapData<Value> | false> | SyncMapData<Value> | false 

  create?(
    ctx: Context,
    id: string,
    fields: Value,
    time: number,
    action: SyncMapCreateAction<Value>,
    meta: ServerMeta
  ): Promise<void | boolean> | void | boolean

  change?(
    ctx: Context,
    id: string,
    fields: Partial<Value>,
    time: number,
    action: SyncMapChangeAction<Value>,
    meta: ServerMeta
  ): Promise<void | boolean> | void | boolean

  delete?(
    ctx: Context,
    id: string,
    action: SyncMapDeleteAction,
    meta: ServerMeta
  ): Promise<void | boolean> | void | boolean
}

interface SyncMapFilterOperations<Value extends SyncMapValues> {
  access?(
    ctx: Context,
    filter: Partial<Value> | undefined,
    action: LoguxSubscribeAction,
    meta: ServerMeta
  ): Promise<boolean> | boolean

  initial(
    ctx: Context,
    filter: Partial<Value> | undefined,
    since: number | undefined,
    action: LoguxSubscribeAction,
    meta: ServerMeta
  ): Promise<SyncMapData<Value>[]> | SyncMapData<Value>[]

  actions?(
    ctx: Context,
    filter: Partial<Value> | undefined,
    action: LoguxSubscribeAction,
    meta: ServerMeta
  ): Promise<SyncMapActionFilter<Value>> | SyncMapActionFilter<Value> | void
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
