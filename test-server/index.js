let { TestTime } = require('@logux/core')

let createReporter = require('../create-reporter')
let BaseServer = require('../base-server')
let TestClient = require('../test-client')

class TestServer extends BaseServer {
  constructor (opts = { }) {
    let time = new TestTime()
    let reporter
    if (opts.reporter === 'human') {
      reporter = createReporter(opts)
    }
    super({
      subprotocol: '0.0.0',
      supports: '0.0.0',
      reporter,
      time,
      id: 'test'
    })
    this.time = time
    this.auth(() => true)
    this.testUsers = { }
  }

  async connect (userId, opts = { }) {
    let client = new TestClient(this, userId, opts)
    await client.connect()
    return client
  }
}

module.exports = TestServer
