'use strict'

const humanProcessReporter = require('./human/process')
const humanErrorReporter = require('./human/error')
const bunyanProcessReporter = require('./bunyan/process')
const bunyanErrorReporter = require('./bunyan/error')

function writeBunyanLog (logger, payload) {
  const details = payload.details || {}
  logger[payload.level](details, payload.msg)
}

module.exports = {
  reportProcess (options) {
    const args = Array.prototype.slice.call(arguments, 1)
    if (options.reporter === 'bunyan') {
      if (!options.bunyanLogger) {
        throw new Error('Missed bunyan logger')
      }
      const payload = bunyanProcessReporter.apply(null, args)
      writeBunyanLog(options.bunyanLogger, payload)
    } else {
      process.stderr.write(humanProcessReporter.apply(null, args))
    }
  },

  reportRuntimeError (options, e) {
    if (options.reporter === 'bunyan') {
      if (!options.bunyanLogger) {
        throw new Error('Missed bunyan logger')
      }
      const payload = bunyanErrorReporter(e, this)
      writeBunyanLog(options.bunyanLogger, payload)
    } else {
      process.stderr.write(humanErrorReporter(e, this))
    }
  }
}
