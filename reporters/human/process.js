'use strict'

const common = require('./common.js')
const pkg = require('../../package.json')

const reporters = {

  listen: function listen (c, app) {
    let url
    if (app.listenOptions.server) {
      url = 'Custom HTTP server'
    } else {
      const protocol = app.listenOptions.cert ? 'wss://' : 'ws://'
      const host = app.listenOptions.host
      const port = app.listenOptions.port
      url = `${ protocol }${ host }:${ port }`
    }

    let result = [
      common.info(c, 'Logux server is listening'),
      common.params(c, [
        ['Logux server', pkg.version],
        ['PID', app.options.pid],
        ['Node ID', app.nodeId],
        ['Environment', app.env],
        ['Subprotocol', app.options.subprotocol],
        ['Supports', app.options.supports],
        ['Listen', url]
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

  connect: function connect (c, app, client) {
    return [
      common.info(c, 'Client was connected'),
      common.params(c, [
        ['Client ID', client.key],
        ['IP address', client.remoteAddress]
      ])
    ]
  },

  unauthenticated: function unauthenticated (c, app, client) {
    return [
      common.warn(c, 'Bad authentication'),
      common.params(c, [
        ['Node ID', client.nodeId],
        ['Subprotocol', client.sync.remoteSubprotocol],
        ['Client ID', client.key]
      ])
    ]
  },

  authenticated: function authenticated (c, app, client) {
    return [
      common.info(c, 'User was authenticated'),
      common.params(c, [
        ['Node ID', client.nodeId],
        ['Subprotocol', client.sync.remoteSubprotocol],
        ['Client ID', client.key]
      ])
    ]
  },

  disconnect: function disconnect (c, app, client) {
    let params
    if (client.nodeId) {
      params = common.params(c, [
        ['Node ID', client.nodeId]
      ])
    } else {
      params = common.params(c, [
        ['Client ID', client.key]
      ])
    }
    return [
      common.info(c, 'Client was disconnected'),
      params
    ]
  },

  destroy: function destroy (c) {
    return [
      common.info(c, 'Shutting down Logux server')
    ]
  },

  runtimeError: function runtimeError (c, app, client, err) {
    let prefix = `${ err.name }: ${ err.message }`
    if (err.name === 'Error') prefix = err.message
    return [
      common.error(c, prefix),
      common.prettyStackTrace(c, err, app.options.root),
      common.errorParams(c, client)
    ]
  },

  syncError: function syncError (c, app, client, err) {
    let prefix
    if (err.received) {
      prefix = `SyncError from client: ${ err.description }`
    } else {
      prefix = `SyncError: ${ err.description }`
    }
    return [
      common.error(c, prefix),
      common.errorParams(c, client)
    ]
  },

  clientError: function clientError (c, app, client, err) {
    return [
      common.warn(c, `Client error: ${ err.description }`),
      common.errorParams(c, client)
    ]
  },

  add: function add (c, app, action, meta) {
    return [
      common.info(c, 'Action was added'),
      common.params(c, [
        ['Time', new Date(meta.time)],
        ['Action', action],
        ['Meta', meta]
      ])
    ]
  },

  clean: function clean (c, app, action, meta) {
    return [
      common.info(c, 'Action was cleaned'),
      common.params(c, [
        ['Action ID', meta.id]
      ])
    ]
  }

}

module.exports = function processReporter (type, app) {
  const c = common.color(app)
  const args = [c].concat(Array.prototype.slice.call(arguments, 1))
  return common.message(reporters[type].apply({ }, args))
}
