var common = require('./common.js')
var pkg = require('../../package.json')

var reporters = {

  listen: function listen (c, app) {
    var url
    if (app.listenOptions.server) {
      url = 'Custom HTTP server'
    } else {
      var protocol = app.listenOptions.cert ? 'wss://' : 'ws://'
      var host = app.listenOptions.host
      var port = app.listenOptions.port
      url = `${ protocol }${ host }:${ port }`
    }

    var result = [
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
    var params
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
    var prefix = `${ err.name }: ${ err.message }`
    if (err.name === 'Error') prefix = err.message
    return [
      common.error(c, prefix),
      common.prettyStackTrace(c, err, app.options.root),
      common.errorParams(c, client)
    ]
  },

  syncError: function syncError (c, app, client, err) {
    var prefix
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
  }

}

module.exports = function serverReporter (type, app) {
  var c = common.color(app)
  var args = [c].concat(Array.prototype.slice.call(arguments, 1))
  return common.message(reporters[type].apply({ }, args))
}
