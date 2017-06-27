'use strict'

const stream = require('stream')
const util = require('util')
const helpers = require('../human/helpers')

// Levels
const TRACE = 10
const DEBUG = 20
const INFO = 30
const WARN = 40
const ERROR = 50
const FATAL = 60

const levelFromName = {
  trace: TRACE,
  debug: DEBUG,
  info: INFO,
  warn: WARN,
  error: ERROR,
  fatal: FATAL
}
const nameFromLevel = {}
Object.keys(levelFromName).forEach(name => {
  const lvl = levelFromName[name]
  nameFromLevel[lvl] = name
})

const Writable = stream.Writable
module.exports = BunyanFormatWritable
util.inherits(BunyanFormatWritable, Writable)

/**
 * Creates a writable stream that formats bunyan records written to it.
 *
 * @name BunyanFormatWritable
 * @function
 * @param {Server} app application object
 * @param {Stream} out (process.stdout) writable stream to write
 * @return {WritableStream} that you can pipe bunyan output into
 */
function BunyanFormatWritable (app, out) {
  if (!(this instanceof BunyanFormatWritable)) {
    return new BunyanFormatWritable(app, out)
  }

  Writable.call(this)
  this.out = out || process.stdout
  this.app = app
}

BunyanFormatWritable.prototype._write = function (chunk, encoding, cb) {
  let rec
  try {
    rec = JSON.parse(chunk)
    this.out.write(formatRecord(rec, this.app))
  } catch (e) {
    this.out.write(chunk)
  }
  cb()
}

function formatRecord (rec, app) {
  let message = []
  const c = helpers.color(app)

  delete rec.v
  delete rec.pid
  delete rec.name
  delete rec.component
  delete rec.hostname
  delete rec.time

  message.push(helpers[nameFromLevel[rec.level]](c, rec.msg))
  delete rec.msg
  delete rec.level

  if (rec.hint) {
    message = message.concat(helpers.hint(c, rec.hint))
    delete rec.hint
  }

  if (rec.stacktrace) {
    message = message.concat(
      helpers.prettyStackTrace(c, rec.stacktrace, app.options.root)
    )
    delete rec.stacktrace
  }

  let note = []
  if (rec.note) {
    note = helpers.note(c, rec.note)
    delete rec.note
  }

  const leftover = Object.keys(rec)
  const params = []
  for (let i = 0; i < leftover.length; i++) {
    const key = leftover[i]
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

  message = message.concat(helpers.params(c, params))
  message = message.concat(note)

  return helpers.message(message)
}
