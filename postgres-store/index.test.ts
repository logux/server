import { PGlite } from '@electric-sql/pglite'
import {
  type Action,
  eachStoreCheck,
  Log,
  type LogPage,
  type Meta
} from '@logux/core'
import { afterAll, beforeEach, expect, it } from 'vitest'

import {
  type PostgresDriver,
  type PostgresQuery,
  PostgresStore
} from '../index.js'

const BIN_PACKER = {
  pack: (action: any) => ({ action: { type: action.type }, blob: action.body }),
  unpack: (packed: any) => ({ body: packed.blob, type: packed.action.type })
}

function createQuery(db: PGlite): PostgresQuery {
  let query: PostgresQuery = async (sql, params) => {
    let result = await db.query(sql, params)
    return result.rows as Record<string, unknown>[]
  }
  query.transaction = body => {
    return db.transaction(async tx => {
      await body(async (sql, params) => {
        let result = await tx.query(sql, params)
        return result.rows as Record<string, unknown>[]
      })
    })
  }
  return query
}

// `LogStore#add()` takes the full `Meta`, but the store sets `added` itself
function meta(id: string, time: number, reasons: string[] = []): Meta {
  return { added: 0, id, reasons, time }
}

async function all(page: LogPage): Promise<[Action, Meta][]> {
  let entries = page.entries
  while (page.next) {
    page = await page.next()
    entries = page.entries.concat(entries)
  }
  return entries
}

let db = await PGlite.create()
let store = new PostgresStore(db)
await store.init()

let empty: PGlite[] = []

// Only the migration tests need a database without the log tables.
// Booting PGlite takes seconds, so the rest reuse the migrated one
async function createEmpty(): Promise<PGlite> {
  let fresh = await PGlite.create()
  empty.push(fresh)
  return fresh
}

function storeWith(
  opts: ConstructorParameters<typeof PostgresStore>[1]
): PostgresStore {
  return new PostgresStore(db, opts)
}

beforeEach(async () => {
  await store.clean()
})

afterAll(async () => {
  await Promise.all(empty.map(i => i.close()))
  await db.close()
})

eachStoreCheck((desc, creator) => {
  it(desc, creator(() => store))
})

it('does not spend the added number on a duplicate ID', async () => {
  expect(await store.add({ type: 'A' }, meta('1 a', 1))).toMatchObject({
    added: 1
  })
  expect(await store.add({ type: 'B' }, meta('1 a', 2))).toBe(false)
  expect(await store.add({ type: 'C' }, meta('2 a', 3))).toMatchObject({
    added: 2
  })
  expect(await store.getLastAdded()).toEqual(2)
})

it('reads entries by pages', async () => {
  let paged = storeWith({ pageSize: 2 })
  for (let i = 1; i <= 5; i++) {
    await paged.add({ type: `${i}` }, meta(`${i} a`, i))
  }

  let byCreated = await all(await paged.get())
  expect(byCreated.map(i => i[0].type)).toEqual(['1', '2', '3', '4', '5'])

  let byAdded = await all(await paged.get({ order: 'added' }))
  expect(byAdded.map(i => i[1].added)).toEqual([1, 2, 3, 4, 5])
})

it('applies migrations only once', async () => {
  await store.add({ type: 'A' }, meta('1 a', 1, ['test']))

  await store.init()

  let rows = await db.query(`SELECT "version" FROM "logux_version"`)
  expect(rows.rows).toEqual([{ version: 1 }])
  expect(await store.getLastAdded()).toEqual(1)
})

it('locks migrations when the driver has transactions', async () => {
  let fresh = await createEmpty()
  let sqls: string[] = []
  let inside = createQuery(fresh)
  let recorder: PostgresQuery = (sql, params) => {
    sqls.push(sql)
    return inside(sql, params)
  }
  recorder.transaction = body =>
    inside.transaction!(tx =>
      body((sql, params) => {
        sqls.push(sql)
        return tx(sql, params)
      })
    )

  let locking = new PostgresStore(recorder)
  await locking.init()

  expect(sqls[0]).toContain('pg_advisory_xact_lock')
  expect(await locking.getLastAdded()).toEqual(0)
})

it('migrates without transactions in the driver', async () => {
  let fresh = await createEmpty()
  let sqls: string[] = []
  let inside = createQuery(fresh)
  let noTransaction: PostgresQuery = (sql, params) => {
    sqls.push(sql)
    return inside(sql, params)
  }

  let simple = new PostgresStore(noTransaction)
  await simple.init()

  expect(sqls.join()).not.toContain('pg_advisory_xact_lock')
  expect(await simple.getLastAdded()).toEqual(0)
})

it('throws on the log from a newer server', async () => {
  let fresh = await createEmpty()
  let newer = new PostgresStore(createQuery(fresh))
  await newer.init()
  await fresh.query(`UPDATE "logux_version" SET "version" = 100`)

  let error: Error | undefined
  try {
    await newer.init()
  } catch (e) {
    if (e instanceof Error) error = e
  }
  expect(error?.name).toEqual('LoguxNewerDatabase')
  expect(error?.message).toEqual('Log from a newer server')
})

it('keeps binary actions in the blob column', async () => {
  let action = {
    d: new Uint8Array([1, 2, 3]),
    iv: new Uint8Array(12).fill(9),
    type: '0'
  }
  await store.add(action, meta('1 a', 1, ['test']))

  let rows = await db.query<{ action: object; blob: null | Uint8Array }>(
    `SELECT "action", "blob" FROM "logux_log"`
  )
  expect(rows.rows[0]!.action).toEqual({ type: '0' })
  expect(rows.rows[0]!.blob).toEqual(new Uint8Array([...action.iv, 1, 2, 3]))

  expect((await store.byId('1 a'))[0]).toEqual(action)
})

it('keeps bytes of unpacked actions in JSON', async () => {
  let action = { list: [new Uint8Array([1, 2])], type: 'A' }
  await store.add(action, meta('1 a', 1, ['test']))

  let rows = await db.query<{ action: any; blob: null | Uint8Array }>(
    `SELECT "action", "blob" FROM "logux_log"`
  )
  expect(rows.rows[0]!.blob).toBeNull()
  expect(rows.rows[0]!.action.list[0]).toEqual({ $bytes: 'AQI=' })

  let [loaded] = await store.byId('1 a')
  expect(loaded).toEqual(action)
  expect((loaded as any).list[0]).toBeInstanceOf(Uint8Array)
})

it('supports custom packers', async () => {
  let packing = storeWith({ packers: { BIN: BIN_PACKER } })

  let action = { body: new Uint8Array([4, 5, 6]), type: 'BIN' }
  await packing.add(action, meta('1 a', 1, ['test']))

  let rows = await db.query<{ blob: Uint8Array }>(
    `SELECT "blob" FROM "logux_log"`
  )
  expect(rows.rows[0]!.blob).toEqual(action.body)
  expect((await packing.byId('1 a'))[0]).toEqual(action)
})

it('throws when the packer for the blob is missing', async () => {
  let packing = storeWith({ packers: { BIN: BIN_PACKER } })
  await packing.add(
    { body: new Uint8Array([1]), type: 'BIN' },
    meta('1 a', 1, ['test'])
  )

  // Another server, which does not know about the `BIN` packer
  await expect(store.byId('1 a')).rejects.toThrow(
    'No packer to unpack BIN action'
  )
})

it('works as a Log store', async () => {
  let log = new Log({ nodeId: 'server:uuid', store })

  await log.add({ type: 'A' }, { reasons: ['test'] })
  await log.add({ type: 'B' }, { reasons: ['test'] })

  let types: string[] = []
  await log.each((action: Action) => {
    types.push(action.type)
  })
  expect(types).toEqual(['B', 'A'])

  await log.removeReason('test')
  expect(await store.getLastAdded()).toEqual(2)
  expect((await store.get()).entries).toEqual([])
})

it('takes queries and transactions from PGlite', async () => {
  let sqls: string[] = []
  let pglite = {
    query: (sql: string, params: unknown[]) => {
      sqls.push(sql)
      return db.query(sql, params)
    },
    transaction: (body: (tx: PostgresDriver) => Promise<void>) =>
      db.transaction(async tx => {
        await body({
          query: (sql: string, params: unknown[]) => {
            sqls.push(sql)
            return tx.query(sql, params)
          }
        })
      })
  }

  let store2 = new PostgresStore(pglite)
  await store2.init()
  expect(sqls[0]).toContain('pg_advisory_xact_lock')

  await store2.add({ type: 'A' }, meta('1 a', 1, ['test']))
  expect((await store2.byId('1 a'))[0]).toEqual({ type: 'A' })
})

it('takes queries and transactions from pg', async () => {
  let sqls: string[] = []
  let released = 0
  let pool = {
    connect: async () => ({
      query: (sql: string, params: unknown[] = []) => {
        sqls.push(sql)
        return db.query(sql, params)
      },
      release: () => {
        released += 1
      }
    }),
    query: (sql: string, params: unknown[]) => db.query(sql, params)
  }

  let store2 = new PostgresStore(pool)
  await store2.init()

  expect(sqls[0]).toEqual('BEGIN')
  expect(sqls[1]).toContain('pg_advisory_xact_lock')
  expect(sqls.at(-1)).toEqual('COMMIT')
  expect(released).toEqual(1)

  await store2.add({ type: 'A' }, meta('1 a', 1, ['test']))
  expect((await store2.byId('1 a'))[0]).toEqual({ type: 'A' })
})

it('rolls back the pg transaction on error', async () => {
  let sqls: string[] = []
  let released = 0
  let pool = {
    connect: async () => ({
      query: (sql: string, params: unknown[] = []) => {
        sqls.push(sql)
        if (sql.includes('logux_version')) throw new Error('Broken')
        return db.query(sql, params)
      },
      release: () => {
        released += 1
      }
    }),
    query: (sql: string, params: unknown[]) => db.query(sql, params)
  }

  await expect(new PostgresStore(pool).init()).rejects.toThrow('Broken')
  expect(sqls.at(-1)).toEqual('ROLLBACK')
  expect(released).toEqual(1)
})

it('takes queries and transactions from postgres', async () => {
  let sqls: string[] = []
  let unsafe = async (
    sql: string,
    params: unknown[] = []
  ): Promise<Record<string, unknown>[]> => {
    sqls.push(sql)
    return (await db.query(sql, params)).rows as Record<string, unknown>[]
  }
  let postgres: any = () => {
    throw new Error('Tagged template is not used')
  }
  postgres.unsafe = unsafe
  postgres.begin = async (body: (tx: PostgresDriver) => Promise<void>) => {
    await db.query('BEGIN')
    try {
      await body({ unsafe })
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  }

  let store2 = new PostgresStore(postgres)
  await store2.init()
  expect(sqls[0]).toContain('pg_advisory_xact_lock')

  await store2.add({ type: 'A' }, meta('1 a', 1, ['test']))
  expect((await store2.byId('1 a'))[0]).toEqual({ type: 'A' })
})

it('works with a driver without transactions', async () => {
  let sqls: string[] = []
  let simple = {
    query: (sql: string, params: unknown[]) => {
      sqls.push(sql)
      return db.query(sql, params)
    }
  }

  let store2 = new PostgresStore(simple)
  await store2.init()

  expect(sqls.join()).not.toContain('pg_advisory_xact_lock')
  await store2.add({ type: 'A' }, meta('1 a', 1, ['test']))
  expect((await store2.byId('1 a'))[0]).toEqual({ type: 'A' })
})

it('reads bytea returned as Buffer', async () => {
  let action = {
    d: new Uint8Array([1, 2, 3]),
    iv: new Uint8Array(12).fill(9),
    type: '0'
  }
  await store.add(action, meta('1 a', 1, ['test']))

  // `pg` and `postgres` return `bytea` as `Buffer`, PGlite as `Uint8Array`
  let buffers = {
    query: async (sql: string, params: unknown[]) => {
      let rows = (await db.query(sql, params)).rows as Record<string, any>[]
      return rows.map(row => {
        return row.blob ? { ...row, blob: Buffer.from(row.blob) } : row
      })
    }
  }

  let [loaded] = await new PostgresStore(buffers).byId('1 a')
  expect(loaded).toEqual(action)
  expect((loaded as any).d.constructor).toBe(Uint8Array)
})
