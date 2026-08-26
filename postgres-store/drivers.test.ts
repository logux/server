import type { Meta } from '@logux/core'
import { Pool } from 'pg'
import postgres from 'postgres'
import { afterAll, beforeEach, expect, it } from 'vitest'

import { type PostgresDriver, PostgresStore } from '../index.js'

// These tests need a real PostgreSQL server. CI sets `DATABASE_URL`
// only in the latest Node.js job
let url = process.env.DATABASE_URL

let pool = new Pool({ connectionString: url })
let sql = postgres(url ?? '', { connect_timeout: 5, max: 4 })

const DRIVERS: [string, PostgresDriver][] = [
  ['pg', pool],
  ['postgres', sql]
]

// The same test on every driver, so that they can not diverge
function eachDriver(
  name: string,
  body: (db: PostgresDriver) => Promise<void>
): void {
  for (let [driver, db] of DRIVERS) {
    it.skipIf(!url)(`${name} on ${driver}`, () => body(db))
  }
}

function meta(id: string, time: number, reasons: string[] = []): Meta {
  return { added: 0, id, reasons, time }
}

beforeEach(async () => {
  if (!url) return
  await pool.query(
    `DROP TABLE IF EXISTS "logux_log", "logux_extra", "logux_version"`
  )
})

afterAll(async () => {
  if (!url) return
  await pool.query(
    `DROP TABLE IF EXISTS "logux_log", "logux_extra", "logux_version"`
  )
  await pool.end()
  await sql.end()
})

eachDriver('stores and reads actions', async db => {
  let store = new PostgresStore(db)
  await store.init()

  await store.add({ type: 'A' }, meta('1 a', 1, ['test']))
  await store.add({ type: 'B' }, meta('2 a', 2, ['test']))

  expect((await store.byId('1 a'))[0]).toEqual({ type: 'A' })
  expect(await store.getLastAdded()).toEqual(2)
  expect((await store.get()).entries.map(i => i[0])).toEqual([
    { type: 'A' },
    { type: 'B' }
  ])

  await store.setLastSynced({ received: 1, sent: 2 })
  expect(await store.getLastSynced()).toEqual({ received: 1, sent: 2 })

  let removed: string[] = []
  await store.removeReason(['test'], {}, action => {
    removed.push(action.type)
  })
  // `DELETE … RETURNING` does not promise the order
  expect(removed.toSorted()).toEqual(['A', 'B'])
})

eachDriver('keeps binary actions in the blob column', async db => {
  let action = {
    d: new Uint8Array([1, 2, 3]),
    iv: new Uint8Array(12).fill(9),
    type: '0'
  }

  let writer = new PostgresStore(db)
  await writer.init()
  await writer.add(action, meta('1 a', 1, ['test']))

  // Every driver must read the blob, which any other driver wrote
  for (let [, reader] of DRIVERS) {
    expect((await new PostgresStore(reader).byId('1 a'))[0]).toEqual(action)
  }
})
