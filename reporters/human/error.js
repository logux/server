'use strict'

const reportersCommon = require('../common')
const common = require('./common')

module.exports = function errorReporter (err, app) {
  const c = common.color(app)
  const help = reportersCommon.errorHelp(err)
  return common.message([
    common.error(c, help.description),
    common.hint(c, help.hint)
  ])
}
