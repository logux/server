let { TestTime } = require('@logux/core')

let createReporter = require('../create-reporter')
let BaseServer = require('../base-server')
let TestClient = require('../test-client')

class TestServer extends BaseServer {
  constructor (opts = {}) {
    let time = new TestTime()
    if (opts.reporter === 'human') {
      opts.reporter = createReporter(opts)
    }
    super({
      subprotocol: '0.0.0',
      supports: '0.0.0',
      time,
      id: 'test',
      ...opts
    })
    this.time = time
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
