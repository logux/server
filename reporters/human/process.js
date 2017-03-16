'use strict'

const reportersCommon = require('../common')
const common = require('./common.js')
const pkg = require('../../package.json')

function clientParams (c, client) {
  if (client.nodeId) {
    return common.params(c, [
      ['Node ID', client.nodeId]
    ])
  } else {
    return common.params(c, [
      ['Client ID', client.key]
    ])
  }
}

const reporters = {

  listen (c, app) {
    let result = [
      common.info(c, 'Logux server is listening'),
      common.params(c, [
        ['Logux server', pkg.version],
        ['PID', app.options.pid],
        ['Node ID', app.nodeId],
        ['Environment', app.env],
        ['Subprotocol', app.options.subprotocol],
        ['Supports', app.options.supports],
        ['Listen', reportersCommon.getAppUrl(app)]
      ])
    ]

    if (app.env === 'development') {
      result = result.concat([
        common.note(c, 'Server was started in non-secure development mode'),
        common.note(c, 'Press Ctrl-C to shutdown server')
      ])
    }

    return result
  },

  connect (c, app, client) {
    return [
      common.info(c, 'Client was connected'),
      common.params(c, [
        ['Client ID', client.key],
        ['IP address', client.remoteAddress]
      ])
    ]
  },

  unauthenticated (c, app, client) {
    return [
      common.warn(c, 'Bad authentication'),
      common.params(c, [
        ['Node ID', client.nodeId],
        ['Subprotocol', client.sync.remoteSubprotocol],
        ['Client ID', client.key]
      ])
    ]
  },

  authenticated (c, app, client) {
    return [
      common.info(c, 'User was authenticated'),
      common.params(c, [
        ['Node ID', client.nodeId],
        ['Subprotocol', client.sync.remoteSubprotocol],
        ['Client ID', client.key]
      ])
    ]
  },

  disconnect (c, app, client) {
    return [
      common.info(c, 'Client was disconnected'),
      clientParams(c, client)
    ]
  },

  destroy (c) {
    return [
      common.info(c, 'Shutting down Logux server')
    ]
  },

  runtimeError (c, app, err, action, meta) {
    let prefix = `${ err.name }: ${ err.message }`
    if (err.name === 'Error') prefix = err.message

    let extra = ''
    if (meta) extra = common.params(c, [['Action ID', meta.id]])

    return [
      common.error(c, prefix),
      common.prettyStackTrace(c, err, app.options.root),
      extra
    ]
  },

  syncError (c, app, client, err) {
    let prefix
    if (err.received) {
      prefix = `SyncError from client: ${ err.description }`
    } else {
      prefix = `SyncError: ${ err.description }`
    }
    return [
      common.error(c, prefix),
      clientParams(c, client)
    ]
  },

  clientError (c, app, client, err) {
    return [
      common.warn(c, `Client error: ${ err.description }`),
      clientParams(c, client)
    ]
  },

  add (c, app, action, meta) {
    return [
      common.info(c, 'Action was added'),
      common.params(c, [
        ['Time', new Date(meta.time)],
        ['Action', action],
        ['Meta', meta]
      ])
    ]
  },

  clean (c, app, action, meta) {
    return [
      common.info(c, 'Action was cleaned'),
      common.params(c, [
        ['Action ID', meta.id]
      ])
    ]
  },

  denied (c, app, action, meta) {
    return [
      common.warn(c, 'Action was denied'),
      common.params(c, [
        ['Action ID', meta.id]
      ])
    ]
  },

  processed (c, app, action, meta, duration) {
    return [
      common.info(c, 'Action was processed'),
      common.params(c, [
        ['Action ID', meta.id],
        ['Duration', `${ duration } ms`]
      ])
    ]
  },

  zombie (c, app, client) {
    return [
      common.warn(c, 'Zombie client was disconnected'),
      common.params(c, [
        ['Node ID', client.nodeId]
      ])
    ]
  }

}

module.exports = function processReporter (type, app) {
  const c = common.color(app)
  const args = [c].concat(Array.prototype.slice.call(arguments, 1))
  return common.message(reporters[type].apply({ }, args))
}
