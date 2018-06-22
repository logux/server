const bunyan = require('bunyan')

const HumanFormatter = require('./human-formatter')

const ERROR_CODES = {
  EADDRINUSE: e => ({
    msg: `Port \`:${ e.port }\` already in use`,
    note: 'Another Logux server or other app already running on this port. ' +
          'Maybe you didn’t not stop server from other project ' +
          'or previous version of this server was not killed.'
  }),
  EACCES: e => ({
    msg: `You are not allowed to run server on port \`:${ e.port }\``,
    note: 'Try to change user (e.g. root) or use port >= 1024'
  }),
  LOGUX_UNKNOWN_OPTION: e => ({
    msg: e.message,
    note: 'Maybe there is a mistake in option name or this version ' +
          'of Logux Server doesn’t support this option'
  }),
  LOGUX_WRONG_OPTIONS: e => ({
    msg: e.message,
    note: 'Check server constructor and Logux Server documentation'
  })
}

const REPORTERS = {
  listen: record => {
    const details = {
      loguxServer: record.loguxServer,
      environment: record.environment,
      nodeId: record.nodeId,
      subprotocol: record.subprotocol,
      supports: record.supports
    }

    if (record.environment === 'development') {
      details.note = [
        'Server was started in non-secure development mode',
        'Press Ctrl-C to shutdown server'
      ]
    }

    if (record.server) {
      details.server = record.server
    } else {
      const protocol = record.cert ? 'wss://' : 'ws://'
      details.listen = `${ protocol }${ record.host }:${ record.port }`
    }

    return { msg: 'Logux server is listening', details }
  },

  connect: () => ({ msg: 'Client was connected' }),

  authenticated: () => ({ msg: 'User was authenticated' }),

  disconnect: () => ({ msg: 'Client was disconnected' }),

  destroy: () => ({ msg: 'Shutting down Logux server' }),

  add: () => ({ msg: 'Action was added' }),

  clean: () => ({ msg: 'Action was cleaned' }),

  processed: () => ({ msg: 'Action was processed' }),

  subscribed: () => ({ msg: 'Client was subscribed' }),

  unsubscribed: () => ({ msg: 'Client was unsubscribed' }),

  unauthenticated: () => ({ level: 'warn', msg: 'Bad authentication' }),

  denied: () => ({ level: 'warn', msg: 'Action was denied' }),

  zombie: () => ({ level: 'warn', msg: 'Zombie client was disconnected' }),

  unknownType: record => ({
    level: /^server(:|$)/.test(record.actionId[1]) ? 'error' : 'warn',
    msg: 'Action with unknown type'
  }),

  wrongChannel: () => ({
    level: 'warn',
    msg: 'Wrong channel name'
  }),

  error: record => {
    const result = {
      level: record.fatal ? 'fatal' : 'error',
      msg: record.err.message,
      details: {
        err: {
          message: record.err.message,
          name: record.err.name,
          stack: record.err.stack
        }
      }
    }

    const helper = ERROR_CODES[record.err.code]
    if (helper) {
      const help = helper(record.err)
      result.msg = help.msg
      result.details.note = help.note
      delete result.details.err.stack
    }

    const isClient = record.clientId || record.nodeId
    if (isClient && record.err.name === 'SyncError') {
      result.level = 'warn'
      if (record.err.received) {
        result.msg = `Client error: ${ record.err.description }`
      } else {
        result.msg = `Sync error: ${ record.err.description }`
      }
      delete result.details.err.stack
    }

    for (const i in record) {
      if (i !== 'err' && i !== 'fatal') {
        result.details[i] = record[i]
      }
    }

    return result
  }
}

function createReporter (options) {
  let logger
  if (options.bunyan) {
    logger = options.bunyan
  } else {
    let streams
    if (options.reporter === 'human') {
      const env = options.env || process.env.NODE_ENV || 'development'
      const color = env !== 'development' ? false : undefined
      streams = [
        {
          type: 'raw',
          stream: new HumanFormatter({ basepath: options.root, color })
        }
      ]
    }
    logger = bunyan.createLogger({ name: 'logux-server', streams })
  }

  function reporter (type, details) {
    const report = REPORTERS[type](details)
    const level = report.level || 'info'
    reporter.logger[level](report.details || details || { }, report.msg)
  }
  reporter.logger = logger
  return reporter
}

module.exports = createReporter
