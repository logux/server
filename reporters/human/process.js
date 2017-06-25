'use strict'

const helpers = require('./helpers')
const common = require('../common')
const pkg = require('../../package.json')

function clientParams (c, client) {
  if (client.nodeId) {
    return helpers.params(c, [
      ['Node ID', client.nodeId]
    ])
  } else {
    return helpers.params(c, [
      ['Client ID', client.key]
    ])
  }
}

const reporters = {

  listen (c, app) {
    let result = [
      helpers.info(c, 'Logux server is listening'),
      helpers.params(c, [
        ['Logux server', pkg.version],
        ['PID', app.options.pid],
        ['Node ID', app.nodeId],
        ['Environment', app.env],
        ['Subprotocol', app.options.subprotocol],
        ['Supports', app.options.supports],
        ['Listen', common.getAppUrl(app)]
      ])
    ]

    if (app.env === 'development') {
      result = result.concat([
        helpers.note(c, 'Server was started in non-secure development mode'),
        helpers.note(c, 'Press Ctrl-C to shutdown server')
      ])
    }

    return result
  },

  connect (c, app, client) {
    return [
      helpers.info(c, 'Client was connected'),
      helpers.params(c, [
        ['Client ID', client.key],
        ['IP address', client.remoteAddress]
      ])
    ]
  },

  unauthenticated (c, app, client) {
    return [
      helpers.warn(c, 'Bad authentication'),
      helpers.params(c, [
        ['Node ID', client.nodeId],
        ['Subprotocol', client.sync.remoteSubprotocol],
        ['Client ID', client.key]
      ])
    ]
  },

  authenticated (c, app, client) {
    return [
      helpers.info(c, 'User was authenticated'),
      helpers.params(c, [
        ['Node ID', client.nodeId],
        ['Subprotocol', client.sync.remoteSubprotocol],
        ['Client ID', client.key]
      ])
    ]
  },

  disconnect (c, app, client) {
    return [
      helpers.info(c, 'Client was disconnected'),
      clientParams(c, client)
    ]
  },

  destroy (c) {
    return [
      helpers.info(c, 'Shutting down Logux server')
    ]
  },

  error (c, app, error) {
    const help = common.errorHelp(error)
    return [
      helpers.error(c, help.description),
      helpers.hint(c, help.hint)
    ]
  },

  runtimeError (c, app, err, action, meta) {
    let prefix = `${ err.name }: ${ err.message }`
    if (err.name === 'Error') prefix = err.message

    let extra = ''
    if (meta) extra = helpers.params(c, [['Action ID', meta.id]])

    return [
      helpers.error(c, prefix),
      helpers.prettyStackTrace(c, err, app.options.root),
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
      helpers.error(c, prefix),
      clientParams(c, client)
    ]
  },

  clientError (c, app, client, err) {
    return [
      helpers.warn(c, `Client error: ${ err.description }`),
      clientParams(c, client)
    ]
  },

  add (c, app, action, meta) {
    return [
      helpers.info(c, 'Action was added'),
      helpers.params(c, [
        ['Time', new Date(meta.time)],
        ['Action', action],
        ['Meta', meta]
      ])
    ]
  },

  clean (c, app, action, meta) {
    return [
      helpers.info(c, 'Action was cleaned'),
      helpers.params(c, [
        ['Action ID', meta.id]
      ])
    ]
  },

  denied (c, app, action, meta) {
    return [
      helpers.warn(c, 'Action was denied'),
      helpers.params(c, [
        ['Action ID', meta.id]
      ])
    ]
  },

  processed (c, app, action, meta, duration) {
    return [
      helpers.info(c, 'Action was processed'),
      helpers.params(c, [
        ['Action ID', meta.id],
        ['Duration', `${ duration } ms`]
      ])
    ]
  },

  unknownType (c, app, action, meta) {
    const type = common.isServer(meta.id) ? helpers.error : helpers.warn
    return [
      type(c, `Action with unknown type ${ action.type }`),
      helpers.params(c, [
        ['Action ID', meta.id]
      ])
    ]
  },

  zombie (c, app, client) {
    return [
      helpers.warn(c, 'Zombie client was disconnected'),
      helpers.params(c, [
        ['Node ID', client.nodeId]
      ])
    ]
  }

}

module.exports = function processReporter (type, app) {
  const c = helpers.color(app)
  const args = [c].concat(Array.prototype.slice.call(arguments, 1))
  return helpers.message(reporters[type].apply({ }, args))
}
