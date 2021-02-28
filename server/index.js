import { join, relative } from 'path'
import buildYargs from 'yargs'
import dotenv from 'dotenv'
import globby from 'globby'

import { createReporter } from '../create-reporter/index.js'
import { BaseServer } from '../base-server/index.js'

const AVAILABLE_OPTIONS = [
  'subprotocol',
  'supports',
  'timeout',
  'ping',
  'root',
  'store',
  'server',
  'port',
  'host',
  'key',
  'cert',
  'env',
  'logger',
  'backend',
  'controlMask',
  'controlSecret',
  'redis',
  'fileUrl'
]

const ENVS = {
  host: 'LOGUX_HOST',
  port: 'LOGUX_PORT',
  key: 'LOGUX_KEY',
  cert: 'LOGUX_CERT',
  logger: 'LOGUX_LOGGER',
  redis: 'LOGUX_REDIS',
  supports: 'LOGUX_SUPPORTS',
  subprotocol: 'LOGUX_SUBPROTOCOL',
  controlMask: 'LOGUX_CONTROL_MASK',
  controlSecret: 'LOGUX_CONTROL_SECRET',
  backend: 'LOGUX_BACKEND'
}

function envHelp () {
  let lines = ['  ']
  for (let key in ENVS) {
    if (lines[lines.length - 1].length + ENVS[key].length + 2 > 80) {
      lines.push('  ')
    }
    if (lines[lines.length - 1].length > 2) {
      lines[lines.length - 1] += ', '
    }
    lines[lines.length - 1] += ENVS[key]
  }
  return lines.join('\n')
}

let yargs = buildYargs()

yargs
  .option('host', {
    alias: 'h',
    describe: 'Host to bind server.',
    type: 'string'
  })
  .option('port', {
    alias: 'p',
    describe: 'Port to bind server',
    type: 'number'
  })
  .option('key', {
    describe: 'Path to SSL key ',
    type: 'string'
  })
  .option('cert', {
    describe: 'Path to SSL certificate',
    type: 'string'
  })
  .option('supports', {
    describe: 'Range of supported client subprotocols',
    type: 'string'
  })
  .option('subprotocol', {
    describe: 'Server subprotocol',
    type: 'string'
  })
  .option('logger', {
    alias: 'l',
    describe: 'Logger type',
    choices: ['human', 'json'],
    type: 'string'
  })
  .option('backend', {
    describe: 'Backend to process actions and authentication',
    type: 'string'
  })
  .option('control-secret', {
    describe: 'Secret to control Logux server',
    type: 'string'
  })
  .option('control-mask', {
    describe: 'CIDR masks for IP addresses of control servers',
    type: 'string'
  })
  .option('redis', {
    describe: 'URL to Redis for Logux Server Pro scaling',
    type: 'string'
  })
  .epilog(`Environment variables: \n${envHelp()}`)
  .example('$0 --port 31337 --host 127.0.0.1')
  .example('LOGUX_PORT=1337 $0')
  .locale('en')
  .help()
  .version(false)

export class Server extends BaseServer {
  static loadOptions (process, defaults) {
    if (defaults.root) {
      dotenv.config({ path: join(defaults.root, '.env') })
    } else {
      dotenv.config()
    }
    let argv = yargs.parse(process.argv)
    let opts = {}

    for (let name of AVAILABLE_OPTIONS) {
      if (name !== 'fileUrl') {
        let arg = name.replace(/[A-Z]/g, char => '-' + char.toLowerCase())
        opts[name] = argv[arg] || process.env[ENVS[name]] || defaults[name]
      }
    }

    opts.port = parseInt(opts.port, 10)
    return opts
  }

  constructor (opts) {
    if (!opts) opts = {}
    if (!opts.logger) {
      opts.logger = 'human'
    }
    let reporter = createReporter(opts)

    let initialized = false
    let onError = err => {
      if (initialized) {
        this.emitter.emit('fatal', err)
      } else {
        reporter('error', { err, fatal: true })
        process.exit(1)
      }
    }
    process.on('uncaughtException', onError)
    process.on('unhandledRejection', onError)

    super(opts)

    this.logger = reporter.logger
    this.on('report', reporter)
    this.on('fatal', async () => {
      if (initialized) {
        if (!this.destroying) {
          await this.destroy()
          process.exit(1)
        }
      } else {
        process.exit(1)
      }
    })

    for (let name in opts) {
      if (!AVAILABLE_OPTIONS.includes(name)) {
        let error = new Error(
          `Unknown option \`${name}\` in server constructor`
        )
        error.logux = true
        error.note =
          'Maybe there is a mistake in option name or this ' +
          'version of Logux Server doesn’t support this option'
        error.option = name
        throw error
      }
    }

    initialized = true

    let onExit = async () => {
      await this.destroy()
      process.exit(0)
    }
    process.on('SIGINT', onExit)

    this.unbind.push(() => {
      process.removeListener('SIGINT', onExit)
    })
  }

  async listen (...args) {
    try {
      return BaseServer.prototype.listen.apply(this, args)
    } catch (err) {
      this.emitter.emit('report', 'error', { err })
      return process.exit(1)
    }
  }

  async autoloadModules (files = ['modules/*/index.js', 'modules/*.js']) {
    let matches = await globby(files, {
      cwd: this.options.root,
      absolute: true,
      onlyFiles: true
    })

    await Promise.all(
      matches.map(async file => {
        let serverModule = (await import(file)).default
        if (typeof serverModule === 'function') {
          await serverModule(this)
        } else {
          let name = relative(this.options.root, file)
          let error = new Error(
            'Server module should has default export with function ' +
              'that accepts a server'
          )
          error.logux = true
          error.note = `${name} default export is ${typeof serverModule}`
          throw error
        }
      })
    )
  }
}
