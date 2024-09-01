import os from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import pico from 'picocolors'
import pino from 'pino'

const root = join(fileURLToPath(import.meta.url), '..', '..')
export const PATH_TO_PRETTIFYING_PINO_TRANSPORT = join(
  root,
  '../human-formatter/index.js'
)

const ERROR_CODES = {
  EACCES: (e, environment) => {
    let wayToFix = {
      development:
        'In dev mode it can be done with sudo:\n' + '$ sudo npm start',
      production: '$ su - `<username>`\n' + `$ npm start -p ${e.port}`
    }

    return {
      msg: `You are not allowed to run server on port \`${e.port}\``,
      note:
        "Non-privileged users can't start a listening socket on ports " +
        'below 1024. Try to change user or take another port.\n\n' +
        (wayToFix[environment] || wayToFix.production)
    }
  },
  EADDRINUSE: e => {
    let port = String(e.port)
    let wayToFix = {
      darwin: `$ sudo lsof -i ${e.port}\n` + '$ sudo kill -9 `<processid>`',
      linux:
        '$ su - root\n' +
        `# netstat -nlp | grep ${e.port}\n` +
        'Proto   Local Address   State    PID/Program name\n' +
        `tcp     0.0.0.0:${port.padEnd(8)}LISTEN   \`777\`/node\n` +
        '# sudo kill -9 `777`',
      win32:
        'Run `cmd.exe` as an administrator\n' +
        'C:\\> netstat -a -b -n -o\n' +
        'C:\\> taskkill /F /PID `<processid>`'
    }

    return {
      msg: `Port \`${e.port}\` already in use`,
      note:
        'Another Logux server or other app already running on this port. ' +
        'Probably you haven’t stopped server from other project ' +
        'or previous version of this server was not killed.\n\n' +
        (wayToFix[os.platform()] || '')
    }
  }
}

const REPORTERS = {
  add: () => ({ msg: 'Action was added' }),

  addClean: () => ({ msg: 'Action was added and cleaned' }),

  authenticated: () => ({ msg: 'User was authenticated' }),

  clean: () => ({ msg: 'Action was cleaned' }),

  clientError: record => {
    let result = {
      details: {},
      level: 'warn'
    }
    if (record.err.received) {
      result.msg = `Client error: ${record.err.description}`
    } else {
      result.msg = `Sync error: ${record.err.description}`
    }
    for (let i in record) {
      if (i !== 'err') {
        result.details[i] = record[i]
      }
    }
    return result
  },

  connect: () => ({ msg: 'Client was connected' }),

  denied: () => ({ level: 'warn', msg: 'Action was denied' }),

  destroy: () => ({ msg: 'Shutting down Logux server' }),

  disconnect: () => ({ msg: 'Client was disconnected' }),

  error: record => {
    let result = {
      details: {
        err: {
          message: record.err.message,
          name: record.err.name,
          stack: record.err.stack
        }
      },
      level: record.fatal ? 'fatal' : 'error',
      msg: record.err.message
    }

    let helper = ERROR_CODES[record.err.code]
    if (helper) {
      let help = helper(record.err, record.environment)
      result.msg = help.msg
      result.details.note = help.note
      delete result.details.err.stack
    } else if (record.err.logux) {
      result.details.note = record.err.note
      delete result.details.err
    }

    if (record.err.name === 'LoguxError') {
      delete result.details.err.stack
    }

    for (let i in record) {
      if (i !== 'err' && i !== 'fatal') {
        result.details[i] = record[i]
      }
    }

    return result
  },

  listen: r => {
    let details = {
      environment: r.environment,
      loguxServer: r.loguxServer,
      nodeId: r.nodeId,
      subprotocol: r.subprotocol,
      supports: r.supports
    }

    if (r.environment === 'development') {
      details.note = [
        'Server was started in non-secure development mode',
        'Press Ctrl-C to shutdown server'
      ]
    }

    if (r.server) {
      details.server = r.server
    } else {
      let wsProtocol = r.cert ? 'wss://' : 'ws://'
      let httpProtocol = r.cert ? 'https://' : 'http://'
      details.listen = `${wsProtocol}${r.host}:${r.port}/`
      details.healthCheck = `${httpProtocol}${r.host}:${r.port}/health`
    }

    if (r.redis) {
      details.redis = r.redis
    }

    for (let i in r.notes) details[i] = r.notes[i]

    return { details, msg: 'Logux server is listening' }
  },

  subscribed: () => ({ msg: 'Client was subscribed' }),

  unauthenticated: () => ({ level: 'warn', msg: 'Bad authentication' }),

  unknownType: record => ({
    level: /^ server(:| )/.test(record.actionId) ? 'error' : 'warn',
    msg: 'Action with unknown type'
  }),

  unsubscribed: () => ({ msg: 'Client was unsubscribed' }),

  useless: () => ({ level: 'warn', msg: 'Useless action' }),

  wrongChannel: () => ({
    level: 'warn',
    msg: 'Wrong channel name'
  }),

  zombie: () => ({ level: 'warn', msg: 'Zombie client was disconnected' })
}

function createLogger(options) {
  if (options.logger === 'human' || options.logger.type === 'human') {
    let env = options.env || process.env.NODE_ENV || 'development'
    let color =
      env !== 'development' ? false : pico.createColors().isColorSupported
    let basepath = options.root || process.cwd()
    if (basepath.slice(-1) !== sep) basepath += sep

    let logger = pino(
      pino.transport({
        options: {
          basepath,
          color,
          destination: options.logger.destination
        },
        target: PATH_TO_PRETTIFYING_PINO_TRANSPORT
      })
    )

    // NOTE: needed only for tests
    logger._basepath = basepath
    logger._color = color

    return logger
  }
  return pino(
    {
      name: 'logux-server',
      timestamp: pino.stdTimeFunctions.isoTime
    },
    options.logger.stream || pino.destination()
  )
}

function cleanFromKeys(obj, regexp, seen) {
  let result = {}
  for (let key in obj) {
    let v = obj[key]
    if (typeof v === 'string') {
      result[key] = v.replace(regexp, '[SECRET]')
    } else if (typeof v === 'object' && !Array.isArray(v) && v !== null) {
      if (seen.includes(v)) {
        throw new Error('Circular reference in action')
      }
      seen.push(v)
      result[key] = cleanFromKeys(v, regexp, seen)
      seen.pop()
    } else {
      result[key] = v
    }
  }
  return result
}

export function createReporter(options) {
  let cleanFromLog = options.cleanFromLog || /Bearer [^\s"]+/g
  function reporter(type, details) {
    let report = REPORTERS[type](details)
    let level = report.level || 'info'
    let seen = []
    reporter.logger[level](
      cleanFromKeys(report.details || details || {}, cleanFromLog, seen),
      report.msg.replace(cleanFromLog, '[SECRET]')
    )
  }

  let customLoggerProvided =
    typeof options.logger !== 'string' && 'info' in options.logger
  if (customLoggerProvided) {
    reporter.logger = options.logger
  } else {
    reporter.logger = createLogger(options)
  }
  return reporter
}
