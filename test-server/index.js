import { TestTime } from '@logux/core'

import { createReporter } from '../create-reporter/index.js'
import { BaseServer } from '../base-server/index.js'
import { TestClient } from '../test-client/index.js'

export class TestServer extends BaseServer {
  constructor(opts = {}) {
    if (!opts.time) {
      opts.time = new TestTime()
    }

    opts.time.lastId += 1
    super({
      subprotocol: '0.0.0',
      supports: '0.0.0',
      id: `${opts.time.lastId}`,
      ...opts
    })
    if (opts.logger) {
      this.on('report', createReporter(opts))
    } else {
      this.logger = {
        fatal: () => {},
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {}
      }
    }
    if (opts.auth !== false) this.auth(() => true)
    this.testUsers = {}

    this.on('fatal', () => {
      this.destroy()
    })
  }

  async connect(userId, opts = {}) {
    let client = new TestClient(this, userId, opts)
    await client.connect()
    return client
  }

  async expectWrongCredentials(userId, opts = {}) {
    try {
      await this.connect(userId, opts)
      throw new Error('Credentials passed')
    } catch (e) {
      if (e.message !== 'Wrong credentials') {
        throw e
      }
    }
  }

  async expectDenied(test) {
    await this.expectUndo('denied', test)
  }

  async expectUndo(reason, test) {
    try {
      await test()
      throw new Error('Actions passed without error')
    } catch (e) {
      if (reason === 'denied' && e.message === 'Action was denied') return
      if (e.message === 'Server undid action') {
        if (e.action.reason !== reason) {
          throw new Error(
            `Undo was with ${e.action.reason} reason, not ${reason}`
          )
        }
      } else {
        throw e
      }
    }
  }
}
