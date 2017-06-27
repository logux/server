'use strict'

const pkg = require('./package.json')

function clientParams (client) {
  if (client.nodeId) {
    return { 'nodeId': client.nodeId }
  } else {
    return { 'clientId': client.key }
  }
}

const reportersCommon = {
  errorHelp (e) {
    if (e.code === 'EADDRINUSE') {
      return {
        description: `Port :${ e.port } already in use`,
        hint: [
          'Another Logux server or other app already running on this port',
          'Maybe you didn’t not stop server from other project',
          'or previous version of this server was not killed'
        ]
      }
    } else if (e.code === 'EACCES') {
      return {
        description: 'You are not allowed to run server on this port',
        hint: [
          'Try to change user (e.g. root) or use port >= 1024'
        ]
      }
    } else if (e.code === 'LOGUX_UNKNOWN_OPTION') {
      return {
        description: `Unknown option \`${ e.option }\` in server constructor`,
        hint: [
          'Maybe there is a mistake in option name or this version',
          'of Logux Server doesn’t support this option'
        ]
      }
    } else if (e.code === 'LOGUX_WRONG_OPTIONS') {
      return {
        description: e.message,
        hint: [
          'Check server constructor and Logux Server documentation'
        ]
      }
    } else {
      throw e
    }
  },

  getAppUrl (app) {
    let url
    if (app.options.server) {
      url = 'Custom HTTP server'
    } else {
      const protocol = app.options.cert ? 'wss://' : 'ws://'
      const host = app.options.host
      const port = app.options.port
      url = `${ protocol }${ host }:${ port }`
    }
    return url
  },

  isServer (id) {
    return /^server(:|$)/.test(id[1])
  }
}

const reporters = {

  listen (app) {
    const details = {
      loguxServer: pkg.version,
      nodeId: app.nodeId,
      environment: app.env,
      subprotocol: app.options.subprotocol,
      supports: app.options.supports,
      listen: reportersCommon.getAppUrl(app)
    }
    if (app.env === 'development') {
      details.note = [
        'Server was started in non-secure development mode',
        'Press Ctrl-C to shutdown server'
      ]
    }

    return {
      level: 'info',
      msg: 'Logux server is listening',
      details
    }
  },

  connect (app, client) {
    return {
      level: 'info',
      msg: 'Client was connected',
      details: {
        clientId: client.key,
        ipAddress: client.remoteAddress
      }
    }
  },

  unauthenticated (app, client) {
    return {
      level: 'warn',
      msg: 'Bad authentication',
      details: {
        nodeId: client.nodeId,
        subprotocol: client.sync.remoteSubprotocol,
        clientId: client.key
      }
    }
  },

  authenticated (app, client) {
    return {
      level: 'info',
      msg: 'User was authenticated',
      details: {
        nodeId: client.nodeId,
        subprotocol: client.sync.remoteSubprotocol,
        clientId: client.key
      }
    }
  },

  disconnect (app, client) {
    return {
      level: 'info',
      msg: 'Client was disconnected',
      details: clientParams(client)
    }
  },

  destroy () {
    return {
      level: 'info',
      msg: 'Shutting down Logux server'
    }
  },

  error (app, error) {
    const help = reportersCommon.errorHelp(error)
    return {
      level: 'error',
      msg: help.description,
      details: {
        hint: help.hint
      }
    }
  },

  runtimeError (app, err, action, meta) {
    let prefix = `${ err.name }: ${ err.message }`
    if (err.name === 'Error') prefix = err.message

    const details = {
      stacktrace: err.stack
    }
    if (meta) {
      details['actionId'] = meta.id
    }
    return {
      level: 'error',
      msg: prefix,
      details
    }
  },

  syncError (app, client, err) {
    let msg
    if (err.received) {
      msg = `SyncError from client: ${ err.description }`
    } else {
      msg = `SyncError: ${ err.description }`
    }
    return {
      level: 'error',
      msg,
      details: clientParams(client)
    }
  },

  clientError (app, client, err) {
    return {
      level: 'warn',
      msg: `Client error: ${ err.description }`,
      details: clientParams(client)
    }
  },

  add (app, action, meta) {
    return {
      level: 'info',
      msg: 'Action was added',
      details: {
        time: new Date(meta.time),
        action,
        meta
      }
    }
  },

  clean (app, action, meta) {
    return {
      level: 'info',
      msg: 'Action was cleaned',
      details: {
        actionId: meta.id
      }
    }
  },

  denied (app, action, meta) {
    return {
      level: 'warn',
      msg: 'Action was denied',
      details: {
        actionId: meta.id
      }
    }
  },

  processed (app, action, meta, duration) {
    return {
      level: 'info',
      msg: 'Action was processed',
      details: {
        actionId: meta.id,
        duration
      }
    }
  },

  unknownType (app, action, meta) {
    return {
      level: reportersCommon.isServer(meta.id) ? 'error' : 'warn',
      msg: `Action with unknown type ${ action.type }`,
      details: {
        actionId: meta.id
      }
    }
  },

  zombie (app, client) {
    return {
      level: 'warn',
      msg: 'Zombie client was disconnected',
      details: {
        nodeId: client.nodeId
      }
    }
  }

}

module.exports = function processReporter (type) {
  const args = Array.prototype.slice.call(arguments, 1)
  return reporters[type].apply({ }, args)
}
