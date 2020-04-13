let { TestTime } = require('@logux/core')

let BaseServer = require('../base-server')
let TestClient = require('../test-client')

class TestServer extends BaseServer {
  constructor () {
    let time = new TestTime()
    super({
      subprotocol: '0.0.0',
      supports: '0.0.0',
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
