var yyyymmdd = require('yyyy-mm-dd')
var chalk = require('chalk')
var pkg = require('./package.json')

function rightPag (str, length) {
  var add = length - str.length
  for (var i = 0; i < add; i++) str += ' '
  return str
}

function time (c) {
  return c.gray(yyyymmdd.withTime(module.exports.now()))
}

function info (c, str) {
  return '\n' + c.bold.green.bgBlack.inverse(' INFO ') + ' ' +
    time(c) + ' ' +
    c.bold(str) + '\n'
}

function params (c, fields) {
  var max = 0
  var current
  for (var i = 0; i < fields.length; i++) {
    current = fields[i][0].length + 2
    if (current > max) max = current
  }
  return fields.map(function (field) {
    return '       ' + rightPag(field[0] + ': ', max) + c.bold(field[1])
  }).join('\n') + '\n'
}

function note (c, str) {
  return c.grey('       ' + str + '\n')
}

var reporters = {

  listen: function listen (c, app) {
    var url = app.listenOptions.cert ? 'wss://' : 'ws://'
    url += app.listenOptions.host + ':' + app.listenOptions.port

    var dev = app.env === 'development'

    return info(c, 'Logux server is listening') +
           params(c, [
             ['Logux Server', pkg.version],
             ['Server name', app.options.uniqName],
             ['Environment', app.env],
             ['Listen', url]
           ]) +
           (dev ? note(c, 'Press Ctrl-C to shutdown server') : '')
  },

  destroy: function destroy (c) {
    return info(c, 'Shutting down Logux server')
  }

}

module.exports = function (type, app) {
  var c = chalk
  if (app.env !== 'development') {
    c = new chalk.constructor({ enabled: false })
  }

  var reporter = reporters[type]
  var args = [c].concat(Array.prototype.slice.call(arguments, 1))

  return reporter.apply({ }, args)
}

module.exports.now = function () {
  return new Date()
}
