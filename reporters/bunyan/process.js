'use strict'

const pkg = require('../../package.json')

function clientParams (client) {
  if (client.nodeId) {
    return { 'nodeId': client.nodeId }
  } else {
    return { 'clientId': client.key }
  }
}

const reporters = {

  listen (app) {
    let url
    if (app.listenOptions.server) {
      url = 'Custom HTTP server'
    } else {
      const protocol = app.listenOptions.cert ? 'wss://' : 'ws://'
      const host = app.listenOptions.host
      const port = app.listenOptions.port
      url = `${ protocol }${ host }:${ port }`
    }

    let msg
    if (app.env === 'development') {
      msg = 'Logux server is listening in non-secure development mode'
    } else {
      msg = 'Logux server is listening'
    }

    return {
      level: 'info',
      msg,
      details: {
        loguxServer: pkg.version,
        nodeId: app.nodeId,
        environment: app.env,
        subprotocol: app.options.subprotocol,
        supports: app.options.supports,
        listen: url
      }
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

  runtimeError (app, err, action, meta) {
    const details = {}
    if (meta) {
      details['actionID'] = meta.id
    }
    return {
      level: 'error',
      msg: err,
      details
    }
  },

  syncError (app, client, err) {
    let prefix
    if (err.received) {
      prefix = `SyncError from client: ${ err.description }`
    } else {
      prefix = `SyncError: ${ err.description }`
    }
    return {
      level: 'error',
      msg: prefix,
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
      level: 'info',
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

  zombie (app, client) {
    return {
      level: 'info',
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
