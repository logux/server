'use strict'

const humanProcessReporter = require('./human/process')
const humanErrorReporter = require('./human/error')
const bunyanProcessReporter = require('./bunyan/process')
const bunyanErrorReporter = require('./bunyan/error')

module.exports = {
  reportProcess (options) {
    const args = Array.prototype.slice.call(arguments, 1)
    if (options.reporter === 'bunyan') {
      const x = bunyanProcessReporter.apply(null, args)
      const log = options.bunyanLogger
      log[x.level](x.details, x.msg)
    } else {
      process.stderr.write(humanProcessReporter.apply(null, args))
    }
  },

  reportRuntimeError (options, e) {
    if (options.reporter === 'bunyan') {
      const x = bunyanErrorReporter(e, this)
      const log = options.bunyanLogger
      log[x.level](x.details, x.msg)
    } else {
      process.stderr.write(humanErrorReporter(e, this))
    }
  }
}
