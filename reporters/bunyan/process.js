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

  listen (log, app) {
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

    log.info({
      details: {
        loguxServer: pkg.version,
        nodeId: app.nodeId,
        environment: app.env,
        subprotocol: app.options.subprotocol,
        supports: app.options.supports,
        listen: url
      }
    }, msg)
  },

  connect (log, app, client) {
    log.info({
      details: {
        clientId: client.key,
        ipAddress: client.remoteAddress
      }
    }, 'Client was connected')
  },

  unauthenticated (log, app, client) {
    log.warn({
      details: {
        nodeId: client.nodeId,
        subprotocol: client.sync.remoteSubprotocol,
        clientId: client.key
      }
    }, 'Bad authentication')
  },

  authenticated (log, app, client) {
    log.info({
      details: {
        nodeId: client.nodeId,
        subprotocol: client.sync.remoteSubprotocol,
        clientId: client.key
      }
    }, 'User was authenticated')
  },

  disconnect (log, app, client) {
    log.info({
      details: clientParams(client)
    }, 'Client was disconnected')
  },

  destroy (log) {
    log.info('Shutting down Logux server')
  },

  runtimeError (log, app, err, action, meta) {
    const details = {}
    if (meta) {
      details['actionID'] = meta.id
    }
    // TODO: should we parse user details and provide it as object?
    log.error({
      details
    }, err)
  },

  syncError (log, app, client, err) {
    let prefix
    if (err.received) {
      prefix = `SyncError from client: ${ err.description }`
    } else {
      prefix = `SyncError: ${ err.description }`
    }
    // TODO: should we parse user details and provide it as object?
    log.error({
      details: clientParams(client)
    }, prefix)
  },

  clientError (log, app, client, err) {
    // TODO: should we parse user details and provide it as object?
    log.warn({
      details: clientParams(client)
    }, `Client error: ${ err.description }`)
  },

  add (log, app, action, meta) {
    log.info({
      details: {
        time: new Date(meta.time),
        action,
        meta
      }
    }, 'Action was added')
  },

  clean (log, app, action, meta) {
    log.info({
      details: {
        actionId: meta.id
      }
    }, 'Action was cleaned')
  },

  denied (log, app, action, meta) {
    log.info({
      details: {
        actionId: meta.id
      }
    }, 'Action was denied')
  },

  processed (log, app, action, meta, duration) {
    log.info({
      details: {
        actionId: meta.id,
        duration
      }
    }, 'Action was processed')
  },

  zombie (log, app, client) {
    log.info({
      details: {
        nodeId: client.nodeId
      }
    }, 'Zombie client was disconnected')
  }

}

module.exports = function processReporter (type, app) {
  const log = app.options.bunyanLogger
  const args = [log].concat(Array.prototype.slice.call(arguments, 1))
  reporters[type].apply({ }, args)
}
