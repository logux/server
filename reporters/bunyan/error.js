'use strict'

const reportersCommon = require('../common')

module.exports = function errorReporter (err) {
  const help = reportersCommon.errorHelp(err)
  return {
    level: 'error',
    msg: help.description,
    details: {
      hint: help.hint
    }
  }
}
