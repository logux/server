'use strict'

const stream = require('stream')
const helpers = require('../human/helpers')

const LEVELS = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal'
}

/**
 * Writable stream that formats bunyan records written to human readable.
 */
class BunyanFormatWritable extends stream.Writable {
  /**
  * @param {Server} app application object
  * @param {Stream} out (process.stdout) writable stream to write
  */
  constructor (app, out) {
    super()
    this.out = out || process.stdout
    this.app = app
  }

  write (chunk, encoding, cb) {
    let rec
    const callback = cb || (() => {})
    try {
      rec = JSON.parse(chunk)
      this.out.write(this.formatRecord(rec, this.app))
    } catch (e) {
      this.out.write(chunk)
    }
    callback()
  }

  formatRecord (rec, app) {
    let message = []
    const c = helpers.color(app)

    message.push(helpers[LEVELS[rec.level]](c, rec.msg))

    if (rec.hint) {
      message = message.concat(helpers.hint(c, rec.hint))
    }

    if (rec.stacktrace) {
      message = message.concat(
        helpers.prettyStackTrace(c, rec.stacktrace, app.options.root)
      )
    }

    let note = []
    if (rec.note) {
      note = helpers.note(c, rec.note)
    }

    const params = []
    if (rec.listen) {
      params.push(['PID', rec.pid])
    }

    const blacklist = ['v', 'name', 'component', 'hostname', 'time', 'msg',
      'level', 'hint', 'stacktrace', 'note', 'pid']
    const leftover = Object.keys(rec)
    for (let i = 0; i < leftover.length; i++) {
      const key = leftover[i]
      if (blacklist.indexOf(key) === -1) {
        const value = rec[key]
        const name = key
          .replace(/([A-Z])/g, ' $1')
          .toLowerCase()
          .split(' ')
          .map(elem => {
            if (elem === 'id') return 'ID'
            if (elem === 'ip') return 'IP'

            return elem
          })
          .join(' ')
          .replace(/^./, str => str.toUpperCase())
        params.push([name, value])
      }
    }

    message = message.concat(helpers.params(c, params))
    message = message.concat(note)

    return helpers.message(message)
  }
}

module.exports = BunyanFormatWritable
