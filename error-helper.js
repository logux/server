var chalk = require('chalk')
var separators = require('./log-helper.js').separators
var logHelper = require('./log-helper.js')

function getErrorObject (e) {
  switch (e.code) {
    case 'EADDRINUSE':
      return {
        description: 'Port :' + e.port + ' already in use.',
        hint: [
          'Another Logux server or other app already running on this port',
          'Maybe you didn’t not stop server from other project',
          'or previous version of this server was not killed.'
        ]
      }
    case 'EACCES':
      return {
        description: 'You are not allowed to run server on this port',
        hint: [
          'Try to change user (e.g. root) or use port >= 1024'
        ]
      }
    default:
      throw e
  }
}

function buildErrorMessage (c, errObj) {
  return [
    logHelper.error(c, errObj.description),
    logHelper.hint(c, errObj.hint
      .join(separators.NEXT_LINE + separators.PADDING)
    )
  ]
}

module.exports = function (err, app) {
  var c = chalk
  if (app.env !== 'development') {
    c = new chalk.constructor({ enabled: false })
  }
  var errObj = getErrorObject(err)
  return buildErrorMessage(c, errObj).filter(function (i) {
    return i !== ''
  }).join(separators.NEXT_LINE) + separators.SEPARATOR
}
