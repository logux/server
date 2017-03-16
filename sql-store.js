'use strict'

const Sequelize = require('sequelize')

function nextEntry (store, order, currentOffset) {
  const opts = {
    order: (`${ order } DESC`),
    offset: currentOffset,
    limit: 100
  }
  return store.Log.findAll(opts).then(entries => {
    if (entries.length > 0) {
      const result = entries.map(entry => {
        const meta = JSON.parse(entry.meta)
        meta.added = entry.added
        return [JSON.parse(entry.action), meta]
      })
      return {
        entries: result,
        next: () => nextEntry(store, order, currentOffset + 100)
      }
    } else {
      return { entries: [] }
    }
  })
}

/**
 * `SQL` store for Logux log.
 *
 * @param {string|object} db The name of the database, or precreated
 *                           sequelize object
 * @param {string} [username=null] The username which is used to authenticate
 *                                 against the database.
 * @param {string} [password=null] The password which is used to authenticate
 *                                 against the database.
 *
 * @param {object} options Database connect options.
 * @param {string} [options.prefix='logux'] The prefix for logux tables.
 * @param {string} [options.dialect='mysql'] The dialect of the database you
 *                                           are connecting to. One of
 *                                           mysql, postgres, sqlite and mssql.
 * @param {string} [options.host='localhost'] The host of the relational
 *                                            database.
 * @param {number} [options.port] The port of the relational database.
 *
 * @class
 * @extends Store
 *
 * @example
 * import SQLStore from 'logux-server/sql-store'
 * var log = new Log({ store: new SQLStore('mydb', 'user', 'pass'), nodeId })
 *
 * // or
 *
 * var Sequelize =  require('sequelize')
 * var dbConnection = new Sequelize('dbName', 'user', 'pass'...)
 * var log = new Log({ store: new SQLStore(dbConnection), nodeId })
 */
function SQLStore (db, username, password, options) {
  if (typeof db === 'undefined') {
    throw new Error('Expected database name or connection object for SQLStore')
  }

  if (typeof db === 'string') {
    this.db = new Sequelize(db, username, password, options)
  } else if (db instanceof Sequelize) {
    this.db = db
  } else {
    throw new Error('Expected database name or connection object for SQLStore')
  }

  if (!options) options = { }
  this.prefix = options.prefix || 'logux'
}

SQLStore.prototype = {

  init: function init () {
    if (this.initing) return this.initing

    this.Log = this.db.define(`${ this.prefix }_logs`, {
      added: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      logId: { type: Sequelize.TEXT },
      created: { type: Sequelize.TEXT },
      action: { type: Sequelize.TEXT },
      meta: { type: Sequelize.TEXT },
      time: { type: Sequelize.INTEGER }
    }, {
      timestamps: false,
      underscored: true,
      freezeTableName: true,
      indexes: [
        {
          type: 'UNIQUE',
          unique: true,
          fields: ['logId']
        },
        {
          type: 'UNIQUE',
          unique: true,
          fields: ['created']
        }
      ]
    })

    this.Reason = this.db.define(`${ this.prefix }_reasons`, {
      logAdded: { type: Sequelize.INTEGER },
      name: { type: Sequelize.TEXT }
    }, {
      timestamps: false,
      underscored: true,
      freezeTableName: true,
      indexes: [
        {
          type: 'UNIQUE',
          unique: true,
          fields: ['logAdded', 'name']
        }
      ]
    })

    this.Extra = this.db.define(`${ this.prefix }_extras`, {
      key: { type: Sequelize.TEXT },
      data: { type: Sequelize.TEXT }
    }, {
      timestamps: false,
      underscored: true,
      freezeTableName: true,
      indexes: [
        {
          type: 'UNIQUE',
          unique: true,
          fields: ['key']
        }
      ]
    })

    const store = this

    this.initing = this.db.sync().then(() => {
      const lastSyncedData = JSON.stringify({ sent: 0, received: 0 })
      return store.Extra.findOne({
        where: { key: 'lastSynced' }
      }).then(extra => {
        if (!extra) {
          return store.Extra.create({
            key: 'lastSynced',
            data: lastSyncedData
          }).then(() => store)
        } else {
          return store
        }
      })
    })

    return this.initing
  },

  get: function get (opts) {
    return this.init().then(store => {
      let order = 'added'
      if (opts && opts.order) {
        order = opts.order
      } else if (typeof opts === 'string') {
        order = opts
      }

      return nextEntry(store, order, 0)
    })
  },

  has: function has (id) {
    return this.init().then(store => store.Log.findOne({
      where: { logId: id.toString() }
    })).then(result => !!result)
  },

  remove: function remove (id) {
    return this.init().then(store => store.Log.findOne({
      where: { logId: id.toString() }
    }).then(entry => {
      if (!entry) {
        return false
      } else {
        return store.Log.destroy({
          where: { logId: id.toString() }
        }).then(() => store.Reason.destroy({
          where: { logAdded: entry.added }
        }).then(() => {
          const meta = JSON.parse(entry.meta)
          meta.added = entry.added
          return [JSON.parse(entry.action), meta]
        }))
      }
    }))
  },

  add: function add (action, meta) {
    const entry = {
      logId: meta.id.toString(),
      meta: JSON.stringify(meta),
      time: meta.time,
      action: JSON.stringify(action),
      created: `${ meta.time }\t${ meta.id.slice(1).join('\t') }`
    }

    return this.init().then(store => store.Log.findOne({
      where: { logId: entry.logId }
    }).then(exist => {
      if (exist) {
        return false
      } else {
        return store.Log.create(entry).then(instance => {
          let reasons = meta.reasons || []
          reasons = reasons.map(reason => {
            const reasonAttrs = { logAdded: instance.added, name: reason }
            return reasonAttrs
          })
          return store.Reason.bulkCreate(reasons).then(() => {
            meta.added = instance.added
            return meta
          })
        })
      }
    }))
  },

  changeMeta: function changeMeta (id, diff) {
    return this.init().then(store => store.Log.findOne({
      where: { logId: id.toString() }
    }).then(entry => {
      if (entry) {
        const meta = JSON.parse(entry.meta)
        for (const key in diff) meta[key] = diff[key]
        if (diff.reasons) meta.reasons = diff.reasons
        return store.Log.update({
          meta: JSON.stringify(meta)
        }, {
          where: { added: entry.added }
        }).then(() => {
          if (diff.reasons) {
            return store.Reason.destroy({
              where: { logAdded: entry.added }
            }).then(() => {
              const reasons = diff.reasons.map(reason => {
                const reasonAttrs = { logAdded: entry.added, name: reason }
                return reasonAttrs
              })
              return store.Reason.bulkCreate(reasons)
            })
          } else {
            return Promise.resolve(true)
          }
        })
      } else {
        return Promise.resolve(false)
      }
    }))
  },

  removeReason: function removeReason (reason, criteria, callback) {
    const c = criteria
    return this.init().then(store => store.Reason
      .findAll({ where: { name: reason } })
      .then(reasons => {
        const entriesAdded = reasons.map(r => r.logAdded)
        return store.Log.findAll({ where: { added: { in: entriesAdded } } })
        .then(entries => {
          const reasonsToDelete = []
          return Promise.all(entries.map(entry => {
            if (typeof c.minAdded !== 'undefined' && entry.added < c.minAdded) {
              return Promise.resolve()
            }
            if (typeof c.maxAdded !== 'undefined' && entry.added > c.maxAdded) {
              return Promise.resolve()
            }
            reasonsToDelete.push(entry.added)
            const meta = JSON.parse(entry.meta)
            if (meta.reasons.length === 1) {
              meta.reasons = []
              meta.added = entry.added
              callback(JSON.parse(entry.action), meta)
              return store.Log.destroy({
                where: { added: entry.added }
              })
            } else {
              meta.reasons.splice(meta.reasons.indexOf(reason), 1)
              return store.Log.update({
                meta: JSON.stringify(meta)
              }, {
                where: { added: entry.added }
              })
            }
          }))
          .then(() => store.Reason.destroy({
            where: { logAdded: reasonsToDelete }
          }))
        })
      })
    )
  },

  getLastAdded: function getLastAdded () {
    return this.init().then(store => {
      const opts = { order: 'added DESC' }
      return store.Log.findOne(opts).then(entry => (entry ? entry.added : 0))
    })
  },

  getLastSynced: function getLastSynced () {
    return this.init().then(store => store.Extra.findOne({
      where: { key: 'lastSynced' }
    }).then(entry => {
      const data = JSON.parse(entry.data)
      return { sent: data.sent, received: data.received }
    }))
  },

  setLastSynced: function setLastSynced (values) {
    return this.init().then(store => store.Extra.findOne({
      where: { key: 'lastSynced' }
    }).then(entry => {
      const data = JSON.parse(entry.data)
      if (typeof values.sent !== 'undefined') {
        data.sent = values.sent
      }
      if (typeof values.received !== 'undefined') {
        data.received = values.received
      }
      return store.Extra.update({
        data: JSON.stringify(data)
      }, {
        where: { key: 'lastSynced' }
      })
    }))
  },

  /**
   * Remove all database and data from `DB`.
   *
   * @return {Promise} Promise for end of removing
   *
   * @example
   * afterEach(() => this.store.destroy())
   */
  destroy: function destroy () {
    return this.init().then(store => store.db.drop())
  }

}

module.exports = SQLStore
