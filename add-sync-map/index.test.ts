import {
  defineSyncMapActions,
  LoguxNotFoundError,
  loguxProcessed,
  loguxSubscribed
} from '@logux/actions'
import { delay } from 'nanodelay'
import { afterEach, expect, it } from 'vitest'

import {
  addSyncMap,
  addSyncMapFilter,
  ChangedAt,
  NoConflictResolution,
  type SyncMapData,
  type TestClient,
  TestServer
} from '../index.js'

type TaskValue = {
  finished: boolean
  text: string
}

type TaskRecord = TaskValue & {
  finishedChanged: number
  textChanged: number
}

let [
  createTask,
  changeTask,
  deleteTask,
  createdTask,
  changedTask,
  deletedTask
] = defineSyncMapActions('tasks')

type CommentValue = {
  author?: string
  text?: string
}
let [
  createComment,
  changeComment,
  deleteComment,
  createdComment,
  changedComment,
  deletedComment
] = defineSyncMapActions('comments')

let tasks = new Map<string, TaskRecord>()

let destroyable: TestServer | undefined

function getTime(client: TestClient, creator: { type: string }): number[] {
  return client.log
    .entries()
    .filter(([action]) => action.type === creator.type)
    .map(([, meta]) => meta.time)
}

function getServer(): TestServer {
  let server = new TestServer()
  destroyable = server
  addSyncMap<TaskValue>(server, 'tasks', {
    access(ctx, id, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      return ctx.userId !== 'wrong' && id !== 'bad'
    },
    change(ctx, id, fields, time, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      expect(typeof ctx.userId).toBe('string')
      let task = tasks.get(id)!
      if (
        typeof fields.finished !== 'undefined' &&
        task.finishedChanged < time
      ) {
        task.finished = fields.finished
        task.finishedChanged = time
      }
      if (typeof fields.text !== 'undefined' && task.textChanged < time) {
        task.text = fields.text
        task.textChanged = time
      }
    },
    create(ctx, id, fields, time, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      expect(typeof ctx.userId).toBe('string')
      tasks.set(id, {
        ...fields,
        finishedChanged: time,
        textChanged: time
      })
    },
    delete(ctx, id, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      expect(typeof ctx.userId).toBe('string')
      tasks.delete(id)
    },
    load(ctx, id, since, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      expect(typeof ctx.userId).toBe('string')
      let task = tasks.get(id)
      if (!task) throw new LoguxNotFoundError()
      return {
        finished: ChangedAt(task.finished, task.finishedChanged),
        id,
        text: ChangedAt(task.text, task.textChanged)
      }
    }
  })
  addSyncMapFilter<TaskValue>(server, 'tasks', {
    access(ctx, filter, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      if (ctx.userId === 'wrong') return false
      if (filter?.text) return false
      return true
    },
    actions(ctx, filter, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      return (ctx2, action2) => action2.id !== 'silence'
    },
    initial(ctx, filter, since, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      let selected: SyncMapData<TaskValue>[] = []
      for (let [id, task] of tasks.entries()) {
        if (filter) {
          let filterKeys = Object.keys(filter) as (keyof TaskValue)[]
          if (filterKeys.some(i => task[i] !== filter[i])) {
            continue
          }
        }
        selected.push({
          finished: ChangedAt(task.finished, task.finishedChanged),
          id,
          text: ChangedAt(task.text, task.textChanged)
        })
      }
      return selected
    }
  })
  return server
}

afterEach(() => {
  destroyable?.destroy()
  tasks.clear()
})

it('checks SyncMap access', async () => {
  let server = getServer()

  let wrong = await server.connect('wrong')
  await server.expectDenied(() => wrong.subscribe('tasks/10'))
  await server.expectDenied(() => wrong.subscribe('tasks'))

  let correct = await server.connect('10')
  await server.expectDenied(() => correct.subscribe('tasks/bad'))
  await server.expectDenied(() => correct.subscribe('tasks', { text: 'A' }))
  await server.expectDenied(() =>
    correct.process(
      createdTask({ fields: { finished: false, text: 'One' }, id: '10' })
    )
  )
  await server.expectDenied(() => correct.process(deletedTask({ id: '10' })))
})

it('supports 404', async () => {
  let server = getServer()
  let client = await server.connect('1')
  await server.expectUndo('notFound', () => client.subscribe('tasks/10'))
})

it('supports SyncMap', async () => {
  let server = getServer()
  let client1 = await server.connect('1')
  let client2 = await server.connect('2')

  client1.log.keepActions()
  client2.log.keepActions()

  await client1.process(
    createTask({ fields: { finished: false, text: 'One' }, id: '10' })
  )
  expect(Object.fromEntries(tasks)).toEqual({
    10: { finished: false, finishedChanged: 1, text: 'One', textChanged: 1 }
  })

  expect(await client1.subscribe('tasks/10')).toEqual([
    changedTask({ fields: { finished: false, text: 'One' }, id: '10' })
  ])
  expect(getTime(client1, changedTask)).toEqual([1])
  await client2.subscribe('tasks/10')

  expect(
    await client2.collect(() =>
      client1.process(changeTask({ fields: { text: 'One1' }, id: '10' }))
    )
  ).toEqual([changedTask({ fields: { text: 'One1' }, id: '10' })])
  expect(Object.fromEntries(tasks)).toEqual({
    10: { finished: false, finishedChanged: 1, text: 'One1', textChanged: 10 }
  })
  expect(getTime(client2, changedTask)).toEqual([1, 10])

  expect(
    await client1.collect(async () => {
      await client1.process(changeTask({ fields: { text: 'One2' }, id: '10' }))
    })
  ).toEqual([loguxProcessed({ id: '13 1:1:1 0' })])

  await client1.process(changeTask({ fields: { text: 'One0' }, id: '10' }), {
    time: 12
  })
  expect(Object.fromEntries(tasks)).toEqual({
    10: { finished: false, finishedChanged: 1, text: 'One2', textChanged: 13 }
  })

  let client3 = await server.connect('3')
  expect(
    await client3.subscribe('tasks/10', undefined, { id: '', time: 12 })
  ).toEqual([changedTask({ fields: { text: 'One2' }, id: '10' })])

  let client4 = await server.connect('3')
  expect(
    await client4.subscribe('tasks/10', undefined, { id: '', time: 20 })
  ).toEqual([])
})

it('supports SyncMap filters', async () => {
  let server = getServer()

  let client1 = await server.connect('1')
  let client2 = await server.connect('2')

  expect(await client1.subscribe('tasks')).toEqual([])
  expect(
    await client1.process(
      createTask({ fields: { finished: false, text: 'One' }, id: '1' })
    )
  ).toEqual([loguxProcessed({ id: '3 1:1:1 0' })])
  await client1.process(
    createTask({ fields: { finished: true, text: 'Two' }, id: '2' })
  )
  await client1.process(
    createTask({ fields: { finished: false, text: 'Three' }, id: '3' })
  )

  expect(await client2.subscribe('tasks', { finished: false })).toEqual([
    loguxSubscribed({ channel: 'tasks/1' }),
    loguxSubscribed({ channel: 'tasks/3' }),
    changedTask({ fields: { finished: false, text: 'One' }, id: '1' }),
    changedTask({ fields: { finished: false, text: 'Three' }, id: '3' })
  ])

  expect(
    await client2.collect(async () => {
      await client1.process(changeTask({ fields: { text: 'One1' }, id: '1' }))
    })
  ).toEqual([changedTask({ fields: { text: 'One1' }, id: '1' })])

  expect(
    await client2.collect(async () => {
      await client1.process(deleteTask({ id: '3' }))
    })
  ).toEqual([deletedTask({ id: '3' })])
  expect(Object.fromEntries(tasks)).toEqual({
    1: { finished: false, finishedChanged: 3, text: 'One1', textChanged: 18 },
    2: { finished: true, finishedChanged: 6, text: 'Two', textChanged: 6 }
  })

  expect(
    await client2.collect(async () => {
      await client1.process(
        createTask({ fields: { finished: false, text: 'Four' }, id: '4' })
      )
    })
  ).toEqual([
    createdTask({ fields: { finished: false, text: 'Four' }, id: '4' })
  ])

  expect(
    await client2.collect(async () => {
      await client1.process(
        createTask({ fields: { finished: true, text: 'Five' }, id: '5' })
      )
    })
  ).toEqual([])

  expect(
    await client2.collect(async () => {
      await client1.process(
        createTask({ fields: { finished: true, text: 'S' }, id: 'silence' })
      )
    })
  ).toEqual([])

  let client3 = await server.connect('3')
  expect(
    await client3.subscribe('tasks', undefined, { id: '', time: 15 })
  ).toEqual([
    loguxSubscribed({ channel: 'tasks/1' }),
    loguxSubscribed({ channel: 'tasks/2' }),
    loguxSubscribed({ channel: 'tasks/4' }),
    loguxSubscribed({ channel: 'tasks/5' }),
    loguxSubscribed({ channel: 'tasks/silence' }),
    changedTask({ fields: { text: 'One1' }, id: '1' }),
    changedTask({ fields: { finished: false, text: 'Four' }, id: '4' }),
    changedTask({ fields: { finished: true, text: 'Five' }, id: '5' }),
    changedTask({ fields: { finished: true, text: 'S' }, id: 'silence' })
  ])

  expect(
    await client3.collect(async () => {
      await client1.process(
        createTask({ fields: { finished: true, text: 'Six' }, id: '6' })
      )
    })
  ).toEqual([createdTask({ fields: { finished: true, text: 'Six' }, id: '6' })])
})

it('supports simpler SyncMap', async () => {
  let server = getServer()
  addSyncMap<CommentValue>(server, 'comments', {
    access() {
      return true
    },
    load(ctx, id, since) {
      if (since) {
        return {
          author: NoConflictResolution('A'),
          id,
          text: NoConflictResolution('updated')
        }
      }
      return {
        author: NoConflictResolution('A'),
        id,
        text: NoConflictResolution('full')
      }
    }
  })
  addSyncMapFilter<CommentValue>(server, 'comments', {
    access() {
      return true
    },
    initial() {
      return []
    }
  })

  let client1 = await server.connect('1')

  expect(await client1.subscribe('comments/1')).toEqual([
    changedComment({ fields: { author: 'A', text: 'full' }, id: '1' })
  ])
  expect(
    await client1.subscribe('comments/2', undefined, { id: '', time: 2 })
  ).toEqual([
    changedComment({ fields: { author: 'A', text: 'updated' }, id: '2' })
  ])

  let client2 = await server.connect('2')
  await client2.subscribe('comments')
  await client2.collect(() =>
    server.process(
      changedComment({ fields: { author: 'A', text: '2' }, id: '10' })
    )
  )
})

it('allows to disable changes', async () => {
  let server = getServer()
  addSyncMap<CommentValue>(server, 'comments', {
    access() {
      return true
    },
    change(ctx, id) {
      return id !== 'bad'
    },
    create(ctx, id) {
      return id !== 'bad'
    },
    delete(ctx, id) {
      return id !== 'bad'
    },
    load(ctx, id) {
      return { id }
    }
  })
  addSyncMapFilter<CommentValue>(server, 'comments', {
    access() {
      return true
    },
    initial() {
      return []
    }
  })

  let client1 = await server.connect('1')
  let client2 = await server.connect('2')

  await client2.subscribe('comments')
  await client2.subscribe('comments/good')
  await client2.subscribe('comments/bad')
  expect(
    await client2.collect(async () => {
      await client1.process(createComment({ fields: {}, id: 'good' }))
      await client1.process(changeComment({ fields: {}, id: 'good' }))
      await client1.process(deleteComment({ id: 'good' }))
      await client1.process(createComment({ fields: {}, id: 'bad' }))
      await client1.process(changeComment({ fields: {}, id: 'bad' }))
      await client1.process(deleteComment({ id: 'bad' }))
    })
  ).toEqual([
    createdComment({ fields: {}, id: 'good' }),
    changedComment({ fields: {}, id: 'good' }),
    deletedComment({ id: 'good' })
  ])
})

it('does not load data on creating', async () => {
  let loaded = 0
  let server = getServer()
  addSyncMap<CommentValue>(server, 'comments', {
    access() {
      return true
    },
    load(ctx, id) {
      loaded += 1
      return { id }
    }
  })

  let client = await server.connect('1')

  await client.log.add({
    channel: 'comments/new',
    type: 'logux/subscribe'
  })
  await delay(10)
  expect(loaded).toBe(1)

  await client.log.add({
    channel: 'comments/new',
    creating: true,
    type: 'logux/subscribe'
  })
  await delay(10)
  expect(loaded).toBe(1)
})

it('throws an error on missed value wrapper', async () => {
  let server = getServer()
  addSyncMap<CommentValue>(server, 'comments', {
    access() {
      return true
    },
    // @ts-expect-error
    load(ctx, id) {
      return { id, text: 'Text' }
    }
  })

  let client = await server.connect('1')

  await server.expectError(/Wrap value/, () => client.subscribe('comments/1'))
})
