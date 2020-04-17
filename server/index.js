let { join, relative } = require('path')
let dotenv = require('dotenv')
let yargs = require('yargs')
let globby = require('globby')

let createReporter = require('../create-reporter')
let BaseServer = require('../base-server')

const AVAILABLE_OPTIONS = [
  'subprotocol', 'supports', 'timeout', 'ping', 'root', 'store', 'server',
  'port', 'host', 'key', 'cert', 'env', 'bunyan', 'reporter', 'backend',
  'controlMask', 'controlSecret', 'redis'
]

const ENVS = {
  host: 'LOGUX_HOST',
  port: 'LOGUX_PORT',
  key: 'LOGUX_KEY',
  cert: 'LOGUX_CERT',
  reporter: 'LOGUX_REPORTER',
  redis: 'LOGUX_REDIS',
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
  .option('reporter', {
    alias: 'r',
    describe: 'Reporter type',
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
  .epilog(`Environment variables: \n${ envHelp() }`)
  .example('$0 --port 31337 --host 127.0.0.1')
  .example('LOGUX_PORT=1337 $0')
  .locale('en')
  .help()
  .version(false)

class Server extends BaseServer {
  static loadOptions (process, defaults = { }) {
    if (defaults.root) {
      dotenv.config({ path: join(defaults.root, '.env') })
    } else {
      dotenv.config()
    }
    let argv = yargs.parse(process.argv)
    let opts = { }

    for (let name of AVAILABLE_OPTIONS) {
      let arg = name.replace(/[A-Z]/g, char => '-' + char.toLowerCase())
      opts[name] = argv[arg] ||
                   process.env[ENVS[name]] ||
                   defaults[name]
    }

    opts.port = parseInt(opts.port, 10)
    return opts
  }

  constructor (opts) {
    if (!opts) opts = { }

    if (typeof opts.reporter !== 'function') {
      opts.reporter = opts.reporter || 'human'
      opts.reporter = createReporter(opts)
    }

    let initialized = false
    let onError = err => {
      if (initialized) {
        this.emitter.emit('fatal', err)
      } else {
        opts.reporter('error', { err, fatal: true })
        process.exit(1)
      }
    }
    process.on('uncaughtException', onError)
    process.on('unhandledRejection', onError)

    super(opts)

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
          `Unknown option \`${ name }\` in server constructor`)
        error.logux = true
        error.note = 'Maybe there is a mistake in option name or this ' +
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
      this.reporter('error', { err })
      return process.exit(1)
    }
  }

  async autoloadModules (pattern = ['modules/*/index.js', 'modules/*.js']) {
    let matches = await globby(pattern, {
      cwd: this.options.root,
      absolute: true,
      onlyFiles: true
    })

    for (let modulePath of matches) {
      // eslint-disable-next-line max-len
      // eslint-disable-next-line global-require, security/detect-non-literal-require
      let serverModule = require(modulePath)

      if (typeof serverModule === 'function') {
        serverModule(this)
      } else {
        let moduleName = relative(this.options.root, modulePath)

        let error = new Error('Server module should export ' +
                              'a function that accepts a server.')
        error.logux = true
        error.note = `Your module ${ moduleName } ` +
                     `exports ${ typeof serverModule }.`

        throw error
      }
    }
  }
}

module.exports = Server
