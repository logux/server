import {
  defineSyncMapActions,
  LoguxNotFoundError,
  loguxSubscribed,
  loguxProcessed
} from '@logux/actions'

import {
  NoConflictResolution,
  addSyncMapFilter,
  SyncMapData,
  TestServer,
  TestClient,
  addSyncMap,
  ChangedAt
} from '../index.js'

type TaskValue = {
  text: string
  finished: boolean
}

type TaskRecord = TaskValue & {
  textChanged: number
  finishedChanged: number
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
  text?: string
  author?: string
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
    load(ctx, id, since, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      expect(typeof ctx.userId).toBe('string')
      let task = tasks.get(id)
      if (!task) throw new LoguxNotFoundError()
      return {
        id,
        text: ChangedAt(task.text, task.textChanged),
        finished: ChangedAt(task.finished, task.finishedChanged)
      }
    },
    create(ctx, id, fields, time, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      expect(typeof ctx.userId).toBe('string')
      tasks.set(id, {
        ...fields,
        textChanged: time,
        finishedChanged: time
      })
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
    delete(ctx, id, action, meta) {
      expect(typeof action.type).toBe('string')
      expect(typeof meta.id).toBe('string')
      expect(typeof ctx.userId).toBe('string')
      tasks.delete(id)
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
          id,
          text: ChangedAt(task.text, task.textChanged),
          finished: ChangedAt(task.finished, task.finishedChanged)
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
      createdTask({ id: '10', fields: { text: 'One', finished: false } })
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
    createTask({ id: '10', fields: { text: 'One', finished: false } })
  )
  expect(Object.fromEntries(tasks)).toEqual({
    10: { text: 'One', finished: false, finishedChanged: 1, textChanged: 1 }
  })

  expect(await client1.subscribe('tasks/10')).toEqual([
    changedTask({ id: '10', fields: { text: 'One', finished: false } })
  ])
  expect(getTime(client1, changedTask)).toEqual([1])
  await client2.subscribe('tasks/10')

  expect(
    await client2.collect(() =>
      client1.process(changeTask({ id: '10', fields: { text: 'One1' } }))
    )
  ).toEqual([changedTask({ id: '10', fields: { text: 'One1' } })])
  expect(Object.fromEntries(tasks)).toEqual({
    10: { text: 'One1', finished: false, finishedChanged: 1, textChanged: 10 }
  })
  expect(getTime(client2, changedTask)).toEqual([1, 10])

  expect(
    await client1.collect(async () => {
      await client1.process(changeTask({ id: '10', fields: { text: 'One2' } }))
    })
  ).toEqual([loguxProcessed({ id: '13 1:1:1 0' })])

  await client1.process(changeTask({ id: '10', fields: { text: 'One0' } }), {
    time: 12
  })
  expect(Object.fromEntries(tasks)).toEqual({
    10: { text: 'One2', finished: false, finishedChanged: 1, textChanged: 13 }
  })

  let client3 = await server.connect('3')
  expect(
    await client3.subscribe('tasks/10', undefined, { id: '', time: 12 })
  ).toEqual([changedTask({ id: '10', fields: { text: 'One2' } })])

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
      createTask({ id: '1', fields: { text: 'One', finished: false } })
    )
  ).toEqual([loguxProcessed({ id: '3 1:1:1 0' })])
  await client1.process(
    createTask({ id: '2', fields: { text: 'Two', finished: true } })
  )
  await client1.process(
    createTask({ id: '3', fields: { text: 'Three', finished: false } })
  )

  expect(await client2.subscribe('tasks', { finished: false })).toEqual([
    loguxSubscribed({ channel: 'tasks/1' }),
    loguxSubscribed({ channel: 'tasks/3' }),
    changedTask({ id: '1', fields: { text: 'One', finished: false } }),
    changedTask({ id: '3', fields: { text: 'Three', finished: false } })
  ])

  expect(
    await client2.collect(async () => {
      await client1.process(changeTask({ id: '1', fields: { text: 'One1' } }))
    })
  ).toEqual([changedTask({ id: '1', fields: { text: 'One1' } })])

  expect(
    await client2.collect(async () => {
      await client1.process(deleteTask({ id: '3' }))
    })
  ).toEqual([deletedTask({ id: '3' })])
  expect(Object.fromEntries(tasks)).toEqual({
    1: { text: 'One1', finished: false, finishedChanged: 3, textChanged: 18 },
    2: { text: 'Two', finished: true, finishedChanged: 6, textChanged: 6 }
  })

  expect(
    await client2.collect(async () => {
      await client1.process(
        createTask({ id: '4', fields: { text: 'Four', finished: false } })
      )
    })
  ).toEqual([
    createdTask({ id: '4', fields: { text: 'Four', finished: false } })
  ])

  expect(
    await client2.collect(async () => {
      await client1.process(
        createTask({ id: '5', fields: { text: 'Five', finished: true } })
      )
    })
  ).toEqual([])

  expect(
    await client2.collect(async () => {
      await client1.process(
        createTask({ id: 'silence', fields: { text: 'S', finished: true } })
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
    changedTask({ id: '1', fields: { text: 'One1' } }),
    changedTask({ id: '4', fields: { text: 'Four', finished: false } }),
    changedTask({ id: '5', fields: { text: 'Five', finished: true } }),
    changedTask({ id: 'silence', fields: { text: 'S', finished: true } })
  ])

  expect(
    await client3.collect(async () => {
      await client1.process(
        createTask({ id: '6', fields: { text: 'Six', finished: true } })
      )
    })
  ).toEqual([createdTask({ id: '6', fields: { text: 'Six', finished: true } })])
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
          id,
          text: NoConflictResolution('updated'),
          author: NoConflictResolution('A')
        }
      }
      return {
        id,
        text: NoConflictResolution('full'),
        author: NoConflictResolution('A')
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
    changedComment({ id: '1', fields: { text: 'full', author: 'A' } })
  ])
  expect(
    await client1.subscribe('comments/2', undefined, { id: '', time: 2 })
  ).toEqual([
    changedComment({ id: '2', fields: { text: 'updated', author: 'A' } })
  ])

  let client2 = await server.connect('2')
  await client2.subscribe('comments')
  await client2.collect(() =>
    server.process(
      changedComment({ id: '10', fields: { text: '2', author: 'A' } })
    )
  )
})

it('allows to disable changes', async () => {
  let server = getServer()
  addSyncMap<CommentValue>(server, 'comments', {
    access() {
      return true
    },
    load(ctx, id) {
      return { id }
    },
    create(ctx, id) {
      return id !== 'bad'
    },
    change(ctx, id) {
      return id !== 'bad'
    },
    delete(ctx, id) {
      return id !== 'bad'
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
      await client1.process(createComment({ id: 'good', fields: {} }))
      await client1.process(changeComment({ id: 'good', fields: {} }))
      await client1.process(deleteComment({ id: 'good' }))
      await client1.process(createComment({ id: 'bad', fields: {} }))
      await client1.process(changeComment({ id: 'bad', fields: {} }))
      await client1.process(deleteComment({ id: 'bad' }))
    })
  ).toEqual([
    createdComment({ id: 'good', fields: {} }),
    changedComment({ id: 'good', fields: {} }),
    deletedComment({ id: 'good' })
  ])
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
