var chalk = require('chalk')
var separators = require('./log-helper.js').separators
var logHelper = require('./log-helper.js')

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
      logHelper.info(c, 'Logux server is listening'),
      logHelper.params(c, 'info', [
        ['Logux server', pkg.version],
        ['PID', app.options.pid],
        ['Node ID', app.options.nodeId],
        ['Environment', app.env],
        ['Subprotocol', app.options.subprotocol],
        ['Supports', app.options.supports],
        ['Listen', url]
      ]),
      (dev ? logHelper.note(c, 'Press Ctrl-C to shutdown server') : '')
    ]
  },

  connect: function connect (c, app, ip) {
    return [
      logHelper.info(c, 'Client was connected'),
      logHelper.params(c, 'info', [['IP address', ip]])
    ]
  },

  authenticated: function authenticated (c, app, client) {
    return [
      logHelper.info(c, 'User was authenticated'),
      logHelper.params(c, 'info', [
        ['User ID', client.user.id],
        ['Node ID', client.nodeId || 'unknown'],
        ['Subprotocol', client.sync.otherSubprotocol],
        ['Logux protocol', client.sync.otherProtocol.join('.')],
        ['IP address', client.remoteAddress]
      ])
    ]
  },

  disconnect: function disconnect (c, app, client) {
    var user = client.user ? client.user.id : 'unauthenticated'
    return [
      logHelper.info(c, 'Client was disconnected'),
      logHelper.params(c, 'info', [
        ['User ID', user],
        ['Node ID', client.nodeId || 'unknown'],
        ['IP address', client.remoteAddress]
      ])
    ]
  },

  destroy: function destroy (c) {
    return [
      logHelper.info(c, 'Shutting down Logux server')
    ]
  },

  runtimeError: function runtimeError (c, app, client, err) {
    var prefix = err.name + ': ' + err.message
    if (err.name === 'Error') prefix = err.message
    return [
      logHelper.error(c, prefix),
      logHelper.prettyStackTrace(c, err, app.options.root),
      logHelper.errorParams(c, 'error', client)
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
      logHelper.error(c, prefix),
      logHelper.errorParams(c, 'error', client)
    ]
  },

  clientError: function clientError (c, app, client, err) {
    return [
      logHelper.warn(c, 'Client error: ' + err.description),
      logHelper.errorParams(c, 'warn', client)
    ]
  }

}

module.exports = function (type, app) {
  var c = chalk
  if (app.env !== 'development') {
    c = new chalk.constructor({ enabled: false })
  }

  var reporter = reporters[type]
  var args = [c].concat(Array.prototype.slice.call(arguments, 1))

  return reporter.apply({ }, args).filter(function (i) {
    return i !== ''
  }).join(separators.NEXT_LINE) + separators.SEPARATOR
}
