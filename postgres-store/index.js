import { zero, zeroPacker } from '@logux/actions'
import { toSorted } from '@logux/core'

class Params {
  values = []

  add(value) {
    this.values.push(value)
    return `$${this.values.length}`
  }
}

const MIGRATIONS = [
  [
    `CREATE TABLE IF NOT EXISTS "logux_log" (
       "added" bigint PRIMARY KEY,
       "id" text NOT NULL UNIQUE,
       "sorted" text COLLATE "C" NOT NULL,
       "time" bigint NOT NULL,
       "type" text NOT NULL,
       "reasons" text[] NOT NULL,
       "indexes" text[] NOT NULL DEFAULT '{}',
       "meta" jsonb NOT NULL,
       "action" jsonb,
       "blob" bytea
     )`,
    `CREATE INDEX IF NOT EXISTS "logux_log_created"
     ON "logux_log" ("sorted" DESC)`,
    `CREATE INDEX IF NOT EXISTS "logux_log_reasons"
     ON "logux_log" USING GIN ("reasons")`,
    `CREATE INDEX IF NOT EXISTS "logux_log_indexes"
     ON "logux_log" USING GIN ("indexes")`,
    `CREATE TABLE IF NOT EXISTS "logux_extra" (
       "key" text PRIMARY KEY,
       "value" bigint NOT NULL
     )`,
    `INSERT INTO "logux_extra" ("key", "value")
     VALUES ('added', 0), ('received', 0), ('sent', 0)
     ON CONFLICT ("key") DO NOTHING`
  ]
]

// JSON has no binary type, but actions can keep `Uint8Array`
// with the encrypted data
function encodeBytes(key, value) {
  if (value instanceof Uint8Array) {
    return { $bytes: Buffer.from(value).toString('base64') }
  }
  return value
}

function decodeBytes(value) {
  if (Array.isArray(value)) return value.map(decodeBytes)
  if (typeof value !== 'object' || value === null) return value
  let object = { ...value }
  let bytes = object.$bytes
  if (typeof bytes === 'string') {
    return new Uint8Array(Buffer.from(bytes, 'base64'))
  }
  for (let key in object) object[key] = decodeBytes(object[key])
  return object
}

function toJson(value) {
  return JSON.stringify(value, encodeBytes)
}

function fromJson(value) {
  return decodeBytes(typeof value === 'string' ? JSON.parse(value) : value)
}

// Position of the action in the `created` order. Logux compares the time,
// the node ID and the time inside the ID, and `toSorted()` packs all three
// into the string, which the database can sort by itself
function position(meta) {
  return toSorted({ ...meta, time: meta.time ?? 0 })
}

function criteriaSql(criteria, params) {
  let where = []
  if (typeof criteria.id !== 'undefined') {
    where.push(`"id" = ${params.add(criteria.id)}`)
  }
  if (typeof criteria.ids !== 'undefined') {
    where.push(`"id" = ANY(${params.add(criteria.ids)}::text[])`)
  }
  if (typeof criteria.index !== 'undefined') {
    where.push(`${params.add(criteria.index)} = ANY("indexes")`)
  }
  if (typeof criteria.exceptIndex !== 'undefined') {
    where.push(`NOT (${params.add(criteria.exceptIndex)} = ANY("indexes"))`)
  }
  if (typeof criteria.minAdded !== 'undefined') {
    where.push(`"added" >= ${params.add(criteria.minAdded)}`)
  }
  if (typeof criteria.maxAdded !== 'undefined') {
    where.push(`"added" <= ${params.add(criteria.maxAdded)}`)
  }
  if (typeof criteria.olderThan !== 'undefined') {
    where.push(`"sorted" < ${params.add(position(criteria.olderThan))}`)
  }
  if (typeof criteria.youngerThan !== 'undefined') {
    where.push(`"sorted" > ${params.add(position(criteria.youngerThan))}`)
  }
  if (where.length === 0) return 'TRUE'
  return where.join(' AND ')
}

// `pg` and PGlite return the rows inside the result, `postgres` returns
// the rows themselves
function toRows(result) {
  return Array.isArray(result) ? result : result.rows
}

// `postgres` is a tagged template function, so its methods are checked
// before the plain function from `PostgresQuery`
function toQuery(db) {
  if (typeof db.unsafe === 'function') {
    return async (sql, params) => toRows(await db.unsafe(sql, params))
  } else if (typeof db.query === 'function') {
    return async (sql, params) => toRows(await db.query(sql, params))
  } else {
    return async (sql, params) => toRows(await db(sql, params))
  }
}

// Every driver has its own way to keep the queries on a single connection.
// Without it `init()` can not lock the migrations
function toTransaction(db) {
  if (typeof db.unsafe === 'function') {
    // `postgres`
    if (typeof db.begin !== 'function') return undefined
    return body => db.begin(tx => body(toQuery(tx)))
  } else if (typeof db.query === 'function') {
    if (typeof db.transaction === 'function') {
      // PGlite
      return body => db.transaction(tx => body(toQuery(tx)))
    } else if (typeof db.connect === 'function') {
      // `pg`
      return async body => {
        let client = await db.connect()
        try {
          await client.query('BEGIN')
          await body(toQuery(client))
          await client.query('COMMIT')
        } catch (e) {
          await client.query('ROLLBACK')
          throw e
        } finally {
          client.release()
        }
      }
    } else {
      return undefined
    }
  } else {
    // The custom query function from `PostgresQuery`
    return db.transaction
  }
}

export class PostgresStore {
  constructor(db, opts = {}) {
    this.query = toQuery(db)
    this.transaction = toTransaction(db)
    this.pageSize = opts.pageSize ?? 500
    this.packers = { [zero.type]: zeroPacker, ...opts.packers }
  }

  async add(action, meta) {
    let packed = this.packers[action.type]?.pack(action)
    let rest = { ...meta }
    delete rest.added
    let rows = await this.query(
      // The action with the same ID is ignored, so it must not spend
      // the next `added` number
      `WITH "found" AS (
         SELECT 1 FROM "logux_log" WHERE "id" = $1
       ), "next" AS (
         UPDATE "logux_extra" SET "value" = "value" + 1
         WHERE "key" = 'added' AND NOT EXISTS (SELECT 1 FROM "found")
         RETURNING "value" AS "added"
       )
       INSERT INTO "logux_log" (
         "added", "id", "sorted", "time", "type",
         "reasons", "indexes", "meta", "action", "blob"
       )
       SELECT
         "next"."added", $1, $2, $3, $4,
         $5::text[], $6::text[], $7::jsonb, $8::jsonb, $9
       FROM "next"
       ON CONFLICT ("id") DO NOTHING
       RETURNING "added"`,
      [
        meta.id,
        position(meta),
        meta.time ?? 0,
        typeof action.type === 'string' ? action.type : '',
        meta.reasons ?? [],
        meta.indexes ?? [],
        toJson(rest),
        toJson(packed ? packed.action : action),
        packed ? packed.blob : null
      ]
    )
    if (rows.length === 0) return false
    // Drivers can return `bigint` as a string not to lose the precision above
    // `Number.MAX_SAFE_INTEGER`. Logux keeps `added` in `meta` as a number,
    // so these columns can never go that high
    meta.added = Number(rows[0].added)
    return meta
  }

  async addReason(reasons, criteria) {
    let params = new Params()
    let list = params.add(reasons)
    await this.query(
      `UPDATE "logux_log" SET "reasons" = "reasons" || (
         SELECT coalesce(array_agg("new"."reason" ORDER BY "new"."at"), '{}')
         FROM unnest(${list}::text[])
           WITH ORDINALITY AS "new"("reason", "at")
         WHERE NOT ("new"."reason" = ANY("logux_log"."reasons"))
       )
       WHERE ${criteriaSql(criteria, params)}`,
      params.values
    )
  }

  async byId(id) {
    let rows = await this.query(`SELECT * FROM "logux_log" WHERE "id" = $1`, [
      id
    ])
    if (rows.length === 0) return [null, null]
    return this.toEntry(rows[0])
  }

  async changeMeta(id, diff) {
    let rest = { ...diff }
    delete rest.added
    let rows = await this.query(
      `UPDATE "logux_log"
       SET "meta" = "meta" || $2::jsonb,
           "reasons" = coalesce($3::text[], "reasons")
       WHERE "id" = $1
       RETURNING "id"`,
      [id, toJson(rest), diff.reasons ?? null]
    )
    return rows.length > 0
  }

  async clean() {
    await this.query(`DELETE FROM "logux_log"`, [])
    await this.query(`UPDATE "logux_extra" SET "value" = 0`, [])
  }

  async get(opts = {}) {
    let byAdded = opts.order === 'added'
    let order = byAdded ? '"added" DESC' : '"sorted" DESC'

    let load = async last => {
      let params = new Params()
      let where = []
      if (typeof opts.index !== 'undefined') {
        where.push(`${params.add(opts.index)} = ANY("indexes")`)
      }
      if (typeof opts.reason !== 'undefined') {
        where.push(`${params.add(opts.reason)} = ANY("reasons")`)
      }
      if (last) {
        if (byAdded) {
          where.push(`"added" < ${params.add(last.added)}`)
        } else {
          where.push(`"sorted" < ${params.add(last.sorted)}`)
        }
      }
      let rows = await this.query(
        `SELECT * FROM "logux_log"
         WHERE ${where.length > 0 ? where.join(' AND ') : 'TRUE'}
         ORDER BY ${order}
         LIMIT ${this.pageSize}`,
        params.values
      )
      // `Log#each()` reads every page from the end, so the newest entries
      // must be in the first page and the oldest one inside the page
      let page = {
        entries: rows.map(row => this.toEntry(row)).toReversed()
      }
      if (rows.length === this.pageSize) {
        let oldest = rows[rows.length - 1]
        page.next = () => load(oldest)
      }
      return page
    }

    return load()
  }

  async getLastAdded() {
    let rows = await this.query(
      `SELECT "value" FROM "logux_extra" WHERE "key" = 'added'`,
      []
    )
    return Number(rows[0].value)
  }

  async getLastSynced() {
    let rows = await this.query(
      `SELECT "key", "value" FROM "logux_extra"
       WHERE "key" IN ('received', 'sent')`,
      []
    )
    let synced = { received: 0, sent: 0 }
    for (let row of rows) {
      if (row.key === 'received') {
        synced.received = Number(row.value)
      } else {
        synced.sent = Number(row.value)
      }
    }
    return synced
  }

  async init() {
    if (this.transaction) {
      await this.transaction(query => this.migrate(query, true))
    } else {
      await this.migrate(this.query, false)
    }
  }

  async migrate(query, locked) {
    // The lock is taken before the first table, so two servers can not race
    // on `CREATE TABLE IF NOT EXISTS` and can not migrate twice
    if (locked) {
      await query(`SELECT pg_advisory_xact_lock(hashtext('logux_log'))`, [])
    }
    await query(
      `CREATE TABLE IF NOT EXISTS "logux_version" ("version" bigint NOT NULL)`,
      []
    )
    let rows = await query(`SELECT "version" FROM "logux_version"`, [])
    let version = rows.length > 0 ? Number(rows[0].version) : 0
    if (version > MIGRATIONS.length) {
      let error = new Error('Log from a newer server')
      error.name = 'LoguxNewerDatabase'
      throw error
    }
    if (version === MIGRATIONS.length) return

    for (let migration of MIGRATIONS.slice(version)) {
      for (let sql of migration) await query(sql, [])
    }
    await query(`DELETE FROM "logux_version"`, [])
    await query(`INSERT INTO "logux_version" ("version") VALUES ($1)`, [
      MIGRATIONS.length
    ])
  }

  async remove(id) {
    let rows = await this.query(
      `DELETE FROM "logux_log" WHERE "id" = $1 RETURNING *`,
      [id]
    )
    if (rows.length === 0) return false
    return this.toEntry(rows[0])
  }

  async removeReason(reasons, criteria, callback) {
    let params = new Params()
    let list = params.add(reasons)
    let where = criteriaSql(criteria, params)
    // The action, which lost the last reason, is deleted. Both statements
    // are in the same query to not read the log twice, and they touch
    // different rows, so the row is never changed twice by one query
    let rows = await this.query(
      `WITH "matched" AS (
         SELECT "id", "reasons" FROM "logux_log"
         WHERE ${where} AND "reasons" && ${list}::text[]
       ), "emptied" AS (
         DELETE FROM "logux_log"
         WHERE "id" IN (
           SELECT "id" FROM "matched" WHERE "reasons" <@ ${list}::text[]
         )
         RETURNING *
       ), "kept" AS (
         UPDATE "logux_log" SET "reasons" = (
           SELECT coalesce(array_agg("old"."reason" ORDER BY "old"."at"), '{}')
           FROM unnest("logux_log"."reasons")
             WITH ORDINALITY AS "old"("reason", "at")
           WHERE NOT ("old"."reason" = ANY(${list}::text[]))
         )
         WHERE "id" IN (
           SELECT "id" FROM "matched" WHERE NOT ("reasons" <@ ${list}::text[])
         )
         RETURNING "id"
       )
       SELECT * FROM "emptied"`,
      params.values
    )
    for (let row of rows) {
      let [action, meta] = this.toEntry(row)
      callback(action, meta)
    }
  }

  async setLastSynced(values) {
    let keys = []
    let numbers = []
    for (let [key, value] of Object.entries(values)) {
      if (typeof value !== 'undefined') {
        keys.push(key)
        numbers.push(value)
      }
    }
    if (keys.length === 0) return
    // Upsert, so a key added to `LastSynced` will not need a migration
    await this.query(
      `INSERT INTO "logux_extra" ("key", "value")
       SELECT * FROM unnest($1::text[], $2::bigint[])
       ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value"`,
      [keys, numbers]
    )
  }

  toAction(row) {
    let action = fromJson(row.action)
    let blob = row.blob
    // Only the packer which wrote the blob can put the action back together
    if (blob === null) return action
    let type = row.type
    let packer = this.packers[type]
    if (!packer) throw new Error(`No packer to unpack ${type} action`)
    // `pg` and `postgres` return `bytea` as `Buffer`
    if (Buffer.isBuffer(blob)) blob = new Uint8Array(blob)
    return packer.unpack({ action, blob })
  }

  toEntry(row) {
    let meta = fromJson(row.meta)
    meta.added = Number(row.added)
    if ('reasons' in meta) meta.reasons = row.reasons
    return [this.toAction(row), meta]
  }
}
