const os = require('os')
const path = require('path')
const chalk = require('chalk')
const yyyymmdd = require('yyyy-mm-dd')
const stripAnsi = require('strip-ansi')

const PADDING = '        '
const SEPARATOR = os.EOL + os.EOL
const NEXT_LINE = os.EOL === '\n' ? '\r\v' : os.EOL

function time (c) {
  return c.dim(`at ${yyyymmdd.withTime(module.exports.now())}`)
}

function rightPag (str, length) {
  const add = length - stripAnsi(str).length
  for (let i = 0; i < add; i++) str += ' '
  return str
}

function labeled (c, label, color, message) {
  const labelFormat = c.bold[color].bgBlack.inverse
  const messageFormat = c.bold[color]
  const pagged = rightPag(labelFormat(label), 8)

  return `${pagged}${messageFormat(message)} ${time(c)}`
}

module.exports = {

  params: function params (c, fields) {
    let max = 0
    let current
    for (let i = 0; i < fields.length; i++) {
      current = fields[i][0].length + 2
      if (current > max) max = current
    }
    return fields.map(field => {
      const start = PADDING + rightPag(`${field[0]}: `, max)
      if (field[0] === 'Node ID') {
        const pos = field[1].indexOf(':')
        let id, random
        if (pos === -1) {
          id = ''
          random = field[1]
        } else {
          id = field[1].slice(0, pos)
          random = field[1].slice(pos)
        }
        return start + c.bold(id) + random
      } else {
        return start + c.bold(field[1])
      }
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
    return strings.map(i => {
      return PADDING + i
    }).join(NEXT_LINE)
  },

  errorParams: function errorParams (c, client) {
    if (!client) {
      return ''
    } else if (client.nodeId) {
      return module.exports.params(c, [
        ['Node ID', client.nodeId || 'unknown']
      ])
    } else {
      return module.exports.params(c, [
        ['IP address', client.remoteAddress]
      ])
    }
  },

  note: function note (c, str) {
    return PADDING + c.grey(str)
  },

  prettyStackTrace: function prettyStackTrace (c, err, root) {
    if (root.slice(-1) !== path.sep) root += path.sep

    return err.stack.split('\n').slice(1).map(i => {
      i = i.replace(/^\s*/, PADDING)
      const match = i.match(/(\s+at [^(]+ \()([^)]+)\)/)
      if (!match || match[2].indexOf(root) !== 0) {
        return c.red(i)
      } else {
        match[2] = match[2].slice(root.length)
        if (match[2].indexOf('node_modules') !== -1) {
          return c.red(`${match[1]}${match[2]})`)
        } else {
          return c.yellow(`${match[1]}${match[2]})`)
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
    return strings.filter(i => {
      return i !== ''
    }).join(NEXT_LINE) + SEPARATOR
  },

  now: function now () {
    return new Date()
  }
}
