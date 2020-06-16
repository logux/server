let { TestTime } = require('@logux/core')

let createReporter = require('../create-reporter')
let BaseServer = require('../base-server')
let TestClient = require('../test-client')

class TestServer extends BaseServer {
  constructor (opts = {}) {
    if (!opts.time) {
      opts.time = new TestTime()
    }
    // By default we don't want any reporter at all
    if (opts.reporter) {
      if (typeof opts.reporter !== 'function') {
        opts.reporter.logger = opts.reporter.logger || 'human'
        opts.reporter = createReporter(opts)
      }
    }
    opts.time.lastId += 1
    super({
      subprotocol: '0.0.0',
      supports: '0.0.0',
      id: `${opts.time.lastId}`,
      ...opts
    })
    if (opts.auth !== false) this.auth(() => true)
    this.testUsers = {}
  }

  async connect (userId, opts = {}) {
    let client = new TestClient(this, userId, opts)
    await client.connect()
    return client
  }
}

module.exports = TestServer
