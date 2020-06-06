let { TestTime } = require('@logux/core')

let createReporter = require('../create-reporter')
let BaseServer = require('../base-server')
let TestClient = require('../test-client')

class TestServer extends BaseServer {
  constructor (opts = {}) {
    if (!opts.time) {
      opts.time = new TestTime()
    }
    if (opts.logger) {
      opts.reporter = createReporter(opts)
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
