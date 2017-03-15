var VERSION = 1

function nextEntry (store, order, offset) {
  opts = {
    order: (order + ' DESC'),
    offset: offset,
    limit: 100
  }
  return store.Log.findAll(opts).then(function (entries) {
    if (entries.size > 0) {
      return {
        entries: entries,
        next: nextEntry(store, order, offset + 100)
      }
    } else {
      return { entries: [] }
    }
  })
}

/**
 * `SQL` store for Logux log.
 *
 * @param {string|object} database The name of the database, or precreated
 *                                 sequelize object
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
function SQLStore (db, username, password, opts) {
  if (typeof db === 'undefined') {
    throw new Error('Expected database name or connection object for SQLStore')
  }

  if (typeof db === 'string') {
    this.db = new Sequelize(db, username, password, opts)
  } else if (db instanceof Sequelize) {
    this.db = db
  } else {
    throw new Error('Expected database name or connection object for SQLStore')
  }

  if (!opts) opts = { }
  this.prefix = opts.prefix || 'logux'
}

SQLStore.prototype = {

  init: function init () {
    if (this.initing) return this.initing

    this.Log = this.db.define(this.prefix + '_logs', {
      added: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      logId: { type: Sequelize.TEXT },
      created: { type: Sequelize.TEXT },
      data: { type: Sequelize.TEXT }
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

    this.Reason = this.db.define(this.prefix + '_reasons', {
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

    this.Extra = this.db.define(this.prefix + '_extras', {
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

    var store = this

    this.initing = this.db.sync().then(function () {
      return this.Extra.create({
        key: 'lastSynced',
        data: JSON.stringify({ sent: 0, received: 0 })
      }).then(function () {
        return store
      })
    })

    return this.initing
  },

  get: function get (opts) {
    var request
    return this.init().then(function (store) {
      if (!opts) opts = { }
      if (!opts.order) opts.order = 'added'
      return nextEntry(store, opts.order, 0)
    })
  },

  has: function has (id) {
    return this.init().then(function (store) {
      return store.Log.findOne(
        { where: { logId: id } }).then(function (result) {
        return !!result
      })
    })
  },

  remove: function remove (id) {
    return this.init().then(function (store) {
      var log = store.os('log', 'write')
      return promisify(log.index('id').get(id)).then(function (entry) {
        if (!entry) {
          return false
        } else {
          return promisify(log.delete(entry.added)).then(function () {
            entry.meta.added = entry.added
            return [entry.action, entry.meta]
          })
        }
      })
    })
  },

  add: function add (action, meta) {
    var entry = {
      id: meta.id,
      meta: meta,
      time: meta.time,
      action: action,
      reasons: meta.reasons,
      created: meta.time + '\t' + meta.id.slice(1).join('\t')
    }

    return this.init().then(function (store) {
      var log = store.os('log', 'write')
      return promisify(log.index('id').get(meta.id)).then(function (exist) {
        if (exist) {
          return false
        } else {
          return promisify(log.add(entry)).then(function (added) {
            meta.added = added
            return meta
          })
        }
      })
    })
  },

  changeMeta: function changeMeta (id, diff) {
    return this.init().then(function (store) {
      var log = store.os('log', 'write')
      return promisify(log.index('id').get(id)).then(function (entry) {
        if (!entry) {
          return false
        } else {
          for (var key in diff) entry.meta[key] = diff[key]
          if (diff.reasons) entry.reasons = diff.reasons
          return promisify(log.put(entry)).then(function () {
            return true
          })
        }
      })
    })
  },

  removeReason: function removeReason (reason, criteria, callback) {
    return this.init().then(function (store) {
      var log = store.os('log', 'write')
      var request = log.index('reasons').openCursor(reason)
      return new Promise(function (resolve, reject) {
        rejectify(request, reject)
        request.onsuccess = function (e) {
          if (!e.target.result) {
            resolve()
            return
          }

          var entry = e.target.result.value
          var c = criteria
          if (typeof c.minAdded !== 'undefined' && entry.added < c.minAdded) {
            e.target.result.continue()
            return
          }
          if (typeof c.maxAdded !== 'undefined' && entry.added > c.maxAdded) {
            e.target.result.continue()
            return
          }

          var process
          if (entry.reasons.length === 1) {
            entry.meta.reasons = []
            entry.meta.added = entry.added
            callback(entry.action, entry.meta)
            process = log.delete(entry.added)
          } else {
            entry.reasons.splice(entry.reasons.indexOf(reason), 1)
            entry.meta.reasons = entry.reasons
            process = log.put(entry)
          }

          rejectify(process, reject)
          process.onsuccess = function () {
            e.target.result.continue()
          }
        }
      })
    })
  },

  getLastAdded: function getLastAdded () {
    return this.init().then(function (store) {
      return promisify(store.os('log').openCursor(null, 'prev'))
    }).then(function (cursor) {
      return cursor ? cursor.value.added : 0
    })
  },

  getLastSynced: function getLastSynced () {
    return this.init().then(function (store) {
      return promisify(store.os('extra').get('lastSynced'))
    }).then(function (data) {
      return { sent: data.sent, received: data.received }
    })
  },

  setLastSynced: function setLastSynced (values) {
    return this.init().then(function (store) {
      var extra = store.os('extra', 'write')
      return promisify(extra.get('lastSynced')).then(function (data) {
        if (typeof values.sent !== 'undefined') {
          data.sent = values.sent
        }
        if (typeof values.received !== 'undefined') {
          data.received = values.received
        }
        return promisify(extra.put(data))
      })
    })
  },

  os: function os (name, write) {
    var mode = write ? 'readwrite' : 'readonly'
    return this.db.transaction(name, mode).objectStore(name)
  },

  /**
   * Remove all database and data from `indexedDB`.
   *
   * @return {Promise} Promise for end of removing
   *
   * @example
   * afterEach(() => this.store.destroy())
   */
  destroy: function destroy () {
    return this.init().then(function (store) {
      store.db.close()
      return promisify(global.indexedDB.deleteDatabase(store.name))
    })
  }

}

module.exports = IndexedStore
