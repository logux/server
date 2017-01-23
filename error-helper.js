var yyyymmdd = require('yyyy-mm-dd')
var stripAnsi = require('strip-ansi')
var chalk = require('chalk')
var os = require('os')
var SEPARATOR = os.EOL + os.EOL
var NEXT_LINE = os.EOL === '\n' ? '\r\v' : os.EOL

function rightPag (str, length) {
  var add = length - stripAnsi(str).length
  for (var i = 0; i < add; i++) str += ' '
  return str
}

function time (c) {
  return c.dim('at ' + yyyymmdd.withTime(module.exports.now()))
}

function line (c, label, color, message) {
  var labelFormat = c.bold[color].bgBlack.inverse
  var messageFormat = c.bold[color]
  return rightPag(labelFormat(label), 8) +
  messageFormat(message) + ' ' +
  time(c)
}

function hint (c, str) {
  return line(c, ' HINT ', 'magenta', str)
}

function error (c, str) {
  return line(c, ' ERROR ', 'red', str)
}

function getErrorObject (e) {
  switch (e.code) {
    case 'EADDRINUSE':
      return {
        description: 'address already in use',
        hint: 'Port :' + e.port + ' already in use. Try to use other port.'
      }
    case 'EACCES':
      return {
        description: 'permission denied',
        hint: 'Run server on port > 1024. Current port: ' + e.port
      }
    default:
      return {
        description: 'undefined error',
        hint: 'Error with this code: ' + e.port + ' is not defined'
      }
  }
}

function buildErrorMessage (c, errObj) {
  return [
    error(c, errObj.description),
    hint(c, errObj.hint)
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
  }).join(NEXT_LINE) + SEPARATOR
}

module.exports.now = function () {
  return new Date()
}
