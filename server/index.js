import { join, relative } from 'path'
import globby from 'globby'
import { bgRed, black } from 'colorette'

import { createReporter } from '../create-reporter/index.js'
import { BaseServer } from '../base-server/index.js'
import { loadOptions, oneOf, number } from '../options-loader/index.js'

let cliOptionsSpec = {
  options: {
    host: {
      alias: 'h',
      description: 'Host to bind server'
    },
    port: {
      alias: 'p',
      description: 'Port to bind server',
      parse: number
    },
    key: {
      description: 'Path to SSL key'
    },
    cert: {
      description: 'Path to SSL certificate'
    },
    supports: {
      description: 'Range of supported client subprotocols'
    },
    subprotocol: {
      description: 'Server subprotocol'
    },
    logger: {
      alias: 'l',
      description: 'Logger type',
      parse: value => oneOf(['human', 'json'], value)
    },
    backend: {
      description: 'Backend to process actions and authentication'
    },
    controlSecret: {
      description: 'Secret to control Logux server'
    },
    controlMask: {
      description: 'CIDR masks for IP addresses of control servers'
    },
    redis: {
      description: 'URL to Redis for Logux Server Pro scaling'
    }
  },
  envPrefix: 'LOGUX',
  examples: ['$0 --port 31337 --host 127.0.0.1', 'LOGUX_PORT=1337 $0']
}

export class Server extends BaseServer {
  static loadOptions (process, defaults) {
    let [help, options] = loadOptions(
      cliOptionsSpec,
      process,
      defaults.root ? { path: join(defaults.root, '.env') } : undefined
    )
    if (help) {
      console.log(help)
      process.exit(0)
    } else {
      try {
        return Object.assign(defaults, options)
      } catch (e) {
        console.error(`${bgRed(black(' ERROR '))} ${e.message}`)
        process.exit(1)
      }
    }
  }

  constructor (opts = {}) {
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
