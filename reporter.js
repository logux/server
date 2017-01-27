var os = require('os')
var path = require('path')
var chalk = require('chalk')
var yyyymmdd = require('yyyy-mm-dd')
var stripAnsi = require('strip-ansi')

var PADDING = '        '
var SEPARATOR = os.EOL + os.EOL
var NEXT_LINE = os.EOL === '\n' ? '\r\v' : os.EOL

function time (c) {
  return c.dim('at ' + yyyymmdd.withTime(module.exports.now()))
}

function rightPag (str, length) {
  var add = length - stripAnsi(str).length
  for (var i = 0; i < add; i++) str += ' '
  return str
}

function labeled (c, label, color, message) {
  var labelFormat = c.bold[color].bgBlack.inverse
  var messageFormat = c.bold[color]

  return rightPag(labelFormat(label), 8) +
         messageFormat(message) + ' ' +
         time(c)
}

module.exports = {

  params: function params (c, type, fields) {
    var max = 0
    var current
    for (var i = 0; i < fields.length; i++) {
      current = fields[i][0].length + 2
      if (current > max) max = current
    }
    return fields.map(function (field) {
      return PADDING + rightPag(field[0] + ': ', max) + c.bold(field[1])
    }).join(NEXT_LINE)
  },

  info: function info (c, str) {
    return labeled(c, ' INFO ', 'green', str)
  },

  warn: function warn (c, str) {
    return labeled(c, ' WARN ', 'yellow', str)
  },

  error: function error (c, str) {
    return labeled(c, ' ERROR ', 'red', str)
  },

  hint: function hint (c, strings) {
    return strings.map(function (i) {
      return PADDING + i
    }).join(NEXT_LINE)
  },

  errorParams: function errorParams (c, type, client) {
    if (!client) {
      return ''
    } else {
      var user = client.user ? client.user.id : 'unauthenticated'
      return module.exports.params(c, 'error', [
        ['User ID', user],
        ['Node ID', client.nodeId || 'unknown'],
        ['Subprotocol', client.sync.otherSubprotocol || 'unknown'],
        ['IP address', client.remoteAddress]
      ])
    }
  },

  note: function note (c, str) {
    return PADDING + c.grey(str)
  },

  prettyStackTrace: function prettyStackTrace (c, err, root) {
    if (root.slice(-1) !== path.sep) root += path.sep

    return err.stack.split('\n').slice(1).map(function (i) {
      i = i.replace(/^\s*/, PADDING)
      var match = i.match(/(\s+at [^(]+ \()([^)]+)\)/)
      if (!match || match[2].indexOf(root) !== 0) {
        return c.red(i)
      } else {
        match[2] = match[2].slice(root.length)
        if (match[2].indexOf('node_modules') !== -1) {
          return c.red(match[1] + match[2] + ')')
        } else {
          return c.yellow(match[1] + match[2] + ')')
        }
      }
    }).join(NEXT_LINE)
  },

  color: function color (app) {
    if (app.env !== 'development') {
      return new chalk.constructor({ enabled: false })
    } else {
      return chalk
    }
  },

  message: function message (strings) {
    return strings.filter(function (i) {
      return i !== ''
    }).join(NEXT_LINE) + SEPARATOR
  },

  now: function now () {
    return new Date()
  }
}
