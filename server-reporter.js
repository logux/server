var reporter = require('./reporter.js')
var pkg = require('./package.json')

var reporters = {

  listen: function listen (c, app) {
    var url
    if (app.listenOptions.server) {
      url = 'Custom HTTP server'
    } else {
      url = (app.listenOptions.cert ? 'wss://' : 'ws://') +
        app.listenOptions.host + ':' + app.listenOptions.port
    }

    var dev = app.env === 'development'

    return [
      reporter.info(c, 'Logux server is listening'),
      reporter.params(c, 'info', [
        ['Logux server', pkg.version],
        ['PID', app.options.pid],
        ['Node ID', app.options.nodeId],
        ['Environment', app.env],
        ['Subprotocol', app.options.subprotocol],
        ['Supports', app.options.supports],
        ['Listen', url]
      ]),
      (dev ? reporter.note(c, 'Press Ctrl-C to shutdown server') : '')
    ]
  },

  connect: function connect (c, app, ip) {
    return [
      reporter.info(c, 'Client was connected'),
      reporter.params(c, 'info', [['IP address', ip]])
    ]
  },

  unauthenticated: function unauthenticated (c, app, client) {
    return [
      reporter.warn(c, 'Bad authentication'),
      reporter.params(c, 'warn', [
        ['Node ID', client.nodeId || 'unknown'],
        ['Subprotocol', client.sync.remoteSubprotocol],
        ['IP address', client.remoteAddress]
      ])
    ]
  },

  authenticated: function authenticated (c, app, client) {
    return [
      reporter.info(c, 'User was authenticated'),
      reporter.params(c, 'info', [
        ['Node ID', client.nodeId || 'unknown'],
        ['Subprotocol', client.sync.remoteSubprotocol],
        ['IP address', client.remoteAddress]
      ])
    ]
  },

  disconnect: function disconnect (c, app, client) {
    return [
      reporter.info(c, 'Client was disconnected'),
      reporter.params(c, 'info', [
        ['Node ID', client.nodeId || 'unknown'],
        ['IP address', client.remoteAddress]
      ])
    ]
  },

  destroy: function destroy (c) {
    return [
      reporter.info(c, 'Shutting down Logux server')
    ]
  },

  runtimeError: function runtimeError (c, app, client, err) {
    var prefix = err.name + ': ' + err.message
    if (err.name === 'Error') prefix = err.message
    return [
      reporter.error(c, prefix),
      reporter.prettyStackTrace(c, err, app.options.root),
      reporter.errorParams(c, 'error', client)
    ]
  },

  syncError: function syncError (c, app, client, err) {
    var prefix
    if (err.received) {
      prefix = 'SyncError from client: ' + err.description
    } else {
      prefix = 'SyncError: ' + err.description
    }
    return [
      reporter.error(c, prefix),
      reporter.errorParams(c, 'error', client)
    ]
  },

  clientError: function clientError (c, app, client, err) {
    return [
      reporter.warn(c, 'Client error: ' + err.description),
      reporter.errorParams(c, 'warn', client)
    ]
  }

}

module.exports = function serverReporter (type, app) {
  var c = reporter.color(app)
  var args = [c].concat(Array.prototype.slice.call(arguments, 1))
  return reporter.message(reporters[type].apply({ }, args))
}
